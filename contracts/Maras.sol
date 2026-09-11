// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {CREATE3} from "solady/src/utils/CREATE3.sol";

/// @notice Marketplace for mined CREATE3 salts. The contract is the factory, so it
/// verifies every claimed address pattern itself and deploys atomically on payment.
/// No private key ever exists and no salt is usable by anyone but this contract.
contract Maras {
    /// @dev `patterns` holds alternatives that all satisfy the buyer: asking for "cafe" loosely
    /// also accepts "caf3", "c4fe" and "c4f3", which cuts the expected grind by that factor.
    /// Fixed length so the struct copies cleanly into storage and the gas stays bounded.
    struct Spec {
        uint8 minZeroBytes;
        uint16 hookMask;
        bool checkHookMask;
        bytes4[16] patterns;
        uint8 patternCount;
        uint8 patternNibbles;
    }

    /// @dev The spec is kept so a buyer can see what the seller claimed and the contract checked,
    /// rather than having to guess from the address what it was mined for.
    struct NamedListing {
        address seller;
        uint96 price;
        bytes32 salt;
        address predicted;
        bool sold;
        Spec spec;
    }

    struct SealedListing {
        address seller;
        uint96 price;
        uint96 bond;
        bytes32 commitHash;
        Spec spec;
        address buyer;
        bytes32 initCodeHash;
        uint64 deadline;
        bool settled;
    }

    struct Request {
        address buyer;
        uint96 bounty;
        Spec spec;
        bytes32 initCodeHash;
        bool filled;
    }

    uint256 public constant DELIVERY_WINDOW = 10 minutes;
    uint8 public constant MAX_PATTERNS = 16;
    uint8 public constant MAX_PATTERN_NIBBLES = 8;
    uint256 private constant ADDRESS_NIBBLES = 40;
    uint160 private constant HOOK_PERMISSION_MASK = 0x3fff;

    mapping(bytes32 => uint256) public commitBlock;
    mapping(bytes32 => bool) public saltClaimed;

    NamedListing[] public namedListings;
    SealedListing[] public sealedListings;
    Request[] public requests;

    event SaltCommitted(bytes32 indexed commitHash, address indexed seller);
    event NamedListed(uint256 indexed id, address indexed seller, address predicted, uint96 price);
    event NamedSold(uint256 indexed id, address indexed buyer, address deployed);
    event SealedListed(uint256 indexed id, address indexed seller, uint96 price);
    event SealedBought(uint256 indexed id, address indexed buyer, uint64 deadline);
    event SealedDelivered(uint256 indexed id, address deployed);
    event SealedTimedOut(uint256 indexed id);
    event RequestPosted(uint256 indexed id, address indexed buyer, uint96 bounty);
    event RequestFilled(uint256 indexed id, address indexed seller, address deployed);

    error CommitMissing();
    error CommitTooEarly();
    error SaltUnavailable();
    error SpecNotMet();
    error WrongPayment();
    error AlreadySettled();
    error NotBuyer();
    error CodeHashMismatch();
    error WindowOpen();
    error WindowClosed();
    error PayoutFailed();
    error TooManyPatterns();

    /// @dev Binds a salt to its seller before reveal so a mempool watcher cannot
    /// copy the salt out of a pending transaction and register it first.
    function commitSalt(bytes32 commitHash) external {
        commitBlock[commitHash] = block.number;
        emit SaltCommitted(commitHash, msg.sender);
    }

    function predictAddress(bytes32 salt) external view returns (address) {
        return CREATE3.predictDeterministicAddress(salt);
    }

    function namedListingCount() external view returns (uint256) {
        return namedListings.length;
    }

    function sealedListingCount() external view returns (uint256) {
        return sealedListings.length;
    }

    function requestCount() external view returns (uint256) {
        return requests.length;
    }

    /// @dev The auto-generated array getters flatten awkwardly around the nested `Spec`, so
    /// callers read whole structs through these instead.
    function getNamedListing(uint256 id) external view returns (NamedListing memory) {
        return namedListings[id];
    }

    function getSealedListing(uint256 id) external view returns (SealedListing memory) {
        return sealedListings[id];
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        return requests[id];
    }

    /// @notice Publishes a mined address for open sale. The salt becomes public, which is
    /// safe because only this contract can deploy with it and only against payment.
    function listNamed(bytes32 salt, uint96 price, Spec calldata spec) external returns (uint256 id) {
        _consumeCommit(salt);
        if (saltClaimed[salt]) revert SaltUnavailable();

        address predicted = CREATE3.predictDeterministicAddress(salt);
        if (!_satisfiesSpec(predicted, spec)) revert SpecNotMet();

        saltClaimed[salt] = true;
        namedListings.push(
            NamedListing({
                seller: msg.sender,
                price: price,
                salt: salt,
                predicted: predicted,
                sold: false,
                spec: spec
            })
        );

        id = namedListings.length - 1;
        emit NamedListed(id, msg.sender, predicted, price);
    }

    /// @notice `initCode` must carry the buyer's address as a constructor argument: during
    /// construction `msg.sender` is the throwaway CREATE3 proxy, never the buyer.
    function buyNamed(uint256 id, bytes calldata initCode) external payable {
        NamedListing storage listing = namedListings[id];
        if (listing.sold) revert AlreadySettled();
        if (msg.value != listing.price) revert WrongPayment();

        listing.sold = true;
        address deployed = CREATE3.deployDeterministic(initCode, listing.salt);
        _payout(listing.seller, msg.value);

        emit NamedSold(id, msg.sender, deployed);
    }

    /// @notice Offers an unrevealed address matching `spec`. Nothing about the address is
    /// published, so the buyer genuinely cannot inspect it before paying. The bond is
    /// slashed if the seller never delivers or the claim turns out to be false.
    function listSealed(bytes32 commitHash, uint96 price, Spec calldata spec)
        external
        payable
        returns (uint256 id)
    {
        sealedListings.push(
            SealedListing({
                seller: msg.sender,
                price: price,
                bond: uint96(msg.value),
                commitHash: commitHash,
                spec: spec,
                buyer: address(0),
                initCodeHash: bytes32(0),
                deadline: 0,
                settled: false
            })
        );

        id = sealedListings.length - 1;
        emit SealedListed(id, msg.sender, price);
    }

    function buySealed(uint256 id, bytes32 initCodeHash) external payable {
        SealedListing storage listing = sealedListings[id];
        if (listing.settled || listing.buyer != address(0)) revert AlreadySettled();
        if (msg.value != listing.price) revert WrongPayment();

        listing.buyer = msg.sender;
        listing.initCodeHash = initCodeHash;
        listing.deadline = uint64(block.timestamp + DELIVERY_WINDOW);

        emit SealedBought(id, msg.sender, listing.deadline);
    }

    function deliverSealed(uint256 id, bytes32 salt, bytes calldata initCode) external {
        SealedListing storage listing = sealedListings[id];
        if (listing.settled) revert AlreadySettled();
        if (block.timestamp > listing.deadline) revert WindowClosed();
        if (keccak256(initCode) != listing.initCodeHash) revert CodeHashMismatch();
        if (keccak256(abi.encode(salt, listing.seller)) != listing.commitHash) revert CommitMissing();
        if (saltClaimed[salt]) revert SaltUnavailable();

        address predicted = CREATE3.predictDeterministicAddress(salt);
        if (!_satisfiesSpec(predicted, listing.spec)) revert SpecNotMet();

        listing.settled = true;
        saltClaimed[salt] = true;
        address deployed = CREATE3.deployDeterministic(initCode, salt);
        _payout(listing.seller, uint256(listing.price) + listing.bond);

        emit SealedDelivered(id, deployed);
    }

    function timeoutSealed(uint256 id) external {
        SealedListing storage listing = sealedListings[id];
        if (listing.settled) revert AlreadySettled();
        if (msg.sender != listing.buyer) revert NotBuyer();
        if (block.timestamp <= listing.deadline) revert WindowOpen();

        listing.settled = true;
        _payout(listing.buyer, uint256(listing.price) + listing.bond);

        emit SealedTimedOut(id);
    }

    /// @notice Escrows a bounty for an address nobody has mined yet. `initCodeHash` binds the
    /// buyer's exact creation code so a seller cannot deploy their own contract at the
    /// qualifying address and collect the bounty.
    function postRequest(Spec calldata spec, bytes32 initCodeHash)
        external
        payable
        returns (uint256 id)
    {
        requests.push(
            Request({
                buyer: msg.sender,
                bounty: uint96(msg.value),
                spec: spec,
                initCodeHash: initCodeHash,
                filled: false
            })
        );

        id = requests.length - 1;
        emit RequestPosted(id, msg.sender, uint96(msg.value));
    }

    function fillRequest(uint256 id, bytes32 salt, bytes calldata initCode) external {
        Request storage request = requests[id];
        if (request.filled) revert AlreadySettled();
        if (keccak256(initCode) != request.initCodeHash) revert CodeHashMismatch();

        _consumeCommit(salt);
        if (saltClaimed[salt]) revert SaltUnavailable();

        address predicted = CREATE3.predictDeterministicAddress(salt);
        if (!_satisfiesSpec(predicted, request.spec)) revert SpecNotMet();

        request.filled = true;
        saltClaimed[salt] = true;
        address deployed = CREATE3.deployDeterministic(initCode, salt);
        _payout(msg.sender, request.bounty);

        emit RequestFilled(id, msg.sender, deployed);
    }

    function _consumeCommit(bytes32 salt) private {
        bytes32 commitHash = keccak256(abi.encode(salt, msg.sender));
        uint256 committedAt = commitBlock[commitHash];
        if (committedAt == 0) revert CommitMissing();
        if (committedAt >= block.number) revert CommitTooEarly();
        delete commitBlock[commitHash];
    }

    function _payout(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }

    function _satisfiesSpec(address addr, Spec memory spec) private pure returns (bool) {
        if (spec.patternCount > MAX_PATTERNS) revert TooManyPatterns();
        if (_leadingZeroBytes(addr) < spec.minZeroBytes) return false;
        if (spec.checkHookMask && !_matchesHookMask(addr, spec.hookMask)) return false;
        if (spec.patternCount > 0 && !_containsAnyPattern(addr, spec)) return false;
        return true;
    }

    /// @dev Nibble-aligned rather than byte-aligned, so a pattern can be any length from one to
    /// eight hex characters and can start at any position in the address.
    function _containsAnyPattern(address addr, Spec memory spec) private pure returns (bool) {
        uint256 nibbles = spec.patternNibbles;
        if (nibbles == 0 || nibbles > MAX_PATTERN_NIBBLES) return false;

        uint256 mask = (uint256(1) << (nibbles * 4)) - 1;
        uint256 maxShift = (ADDRESS_NIBBLES - nibbles) * 4;
        uint256 value = uint160(addr);

        for (uint256 index = 0; index < spec.patternCount; index++) {
            uint256 target = uint256(uint32(spec.patterns[index])) & mask;
            if (_hasRunAt(value, target, mask, maxShift)) return true;
        }
        return false;
    }

    function _hasRunAt(uint256 value, uint256 target, uint256 mask, uint256 maxShift)
        private
        pure
        returns (bool)
    {
        for (uint256 shift = 0; shift <= maxShift; shift += 4) {
            if (((value >> shift) & mask) == target) return true;
        }
        return false;
    }

    function _leadingZeroBytes(address addr) private pure returns (uint8 count) {
        uint160 value = uint160(addr);
        for (uint256 shift = 152; shift <= 152; shift -= 8) {
            if (uint8(value >> shift) != 0) return count;
            count++;
            if (shift == 0) return count;
        }
    }

    /// @dev Uniswap V4 stores a hook's permission set in the low 14 bits of its address,
    /// so the comparison has to be equality against a mask rather than a flag.
    function _matchesHookMask(address addr, uint16 mask) private pure returns (bool) {
        return (uint160(addr) & HOOK_PERMISSION_MASK) == uint160(mask);
    }

}
