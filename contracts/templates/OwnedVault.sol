// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Default buyer payload. The owner arrives as a constructor argument because during
/// construction `msg.sender` is the throwaway CREATE3 proxy — `owner = msg.sender` would hand
/// the contract to the proxy. Passing it in is free: a CREATE3 address does not depend on the
/// creation code, so adding the argument does not move the mined address.
contract OwnedVault {
    address public immutable owner;

    error NotOwner();
    error WithdrawFailed();

    constructor(address owner_) {
        owner = owner_;
    }

    receive() external payable {}

    function withdraw(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }
}
