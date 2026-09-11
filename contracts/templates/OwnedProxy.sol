// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Default buyer payload: an address you own and can point at any contract, the way a
/// domain can be pointed at any server. Calls are forwarded with delegatecall to whatever
/// implementation the owner sets, so the code behind the address can change while the address,
/// and everything that has stored it, stays put.
///
/// The owner arrives as a constructor argument because during construction `msg.sender` is the
/// throwaway CREATE3 proxy. Owner and implementation live in the ERC-1967 slots, so storage
/// written by an implementation can never overwrite them and explorers recognise the proxy.
///
/// The admin functions carry names no ordinary contract uses. Anything this contract declares
/// shadows the implementation's function with the same selector, and an implementation is very
/// likely to have its own `owner()`.
contract OwnedProxy {
    bytes32 private constant IMPLEMENTATION_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 private constant ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    event Upgraded(address indexed implementation);
    event AdminChanged(address previousAdmin, address newAdmin);

    error NotOwner();
    error ZeroOwner();
    error NotAContract();
    error NoImplementation();

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroOwner();
        _setOwner(owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != proxyOwner()) revert NotOwner();
        _;
    }

    function proxyOwner() public view returns (address owner_) {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            owner_ := sload(slot)
        }
    }

    function proxyImplementation() public view returns (address implementation_) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            implementation_ := sload(slot)
        }
    }

    /// @param setup Optional calldata run against the new implementation in this contract's
    /// storage. An implementation's constructor ran at its own address, so anything it needs
    /// initialised here has to be done this way.
    function pointTo(address implementation, bytes calldata setup) external onlyOwner {
        if (implementation.code.length == 0) revert NotAContract();

        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, implementation)
        }
        emit Upgraded(implementation);

        if (setup.length == 0) return;
        (bool ok, bytes memory reason) = implementation.delegatecall(setup);
        if (!ok) {
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    function transferProxyOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroOwner();
        _setOwner(next);
    }

    /// Before it points anywhere the address still takes ETH, so an owner can fund it first.
    receive() external payable {
        address implementation = proxyImplementation();
        if (implementation != address(0)) _delegate(implementation);
    }

    fallback() external payable {
        address implementation = proxyImplementation();
        if (implementation == address(0)) revert NoImplementation();
        _delegate(implementation);
    }

    function _setOwner(address next) private {
        emit AdminChanged(proxyOwner(), next);
        bytes32 slot = ADMIN_SLOT;
        assembly {
            sstore(slot, next)
        }
    }

    function _delegate(address implementation) private {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
