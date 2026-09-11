// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import {Maras} from "./Maras.sol";
import {Test} from "forge-std/Test.sol";

/// @dev The auto-generated getter for an array of structs flattens awkwardly around a nested
/// struct, which is why `Spec` is read through the explicit getters. These tests pin that down.
contract MarasGettersTest is Test {
    Maras maras;

    function setUp() public {
        maras = new Maras();
        vm.deal(address(this), 10 ether);
    }

    function _spec() internal pure returns (Maras.Spec memory spec) {
        spec.minZeroBytes = 3;
        spec.hookMask = 0x2400;
        spec.checkHookMask = true;
        spec.patterns[0] = bytes4(uint32(0x0000cafe));
        spec.patternCount = 1;
        spec.patternNibbles = 4;
    }

    function test_SealedListingGetterKeepsNestedSpec() public {
        maras.listSealed{value: 1 ether}(bytes32(uint256(1)), 0.05 ether, _spec());

        Maras.SealedListing memory listing = maras.getSealedListing(0);

        assertEq(listing.spec.minZeroBytes, 3);
        assertEq(listing.spec.hookMask, 0x2400);
        assertTrue(listing.spec.checkHookMask);
        assertEq(listing.spec.patterns[0], bytes4(uint32(0x0000cafe)));
        assertEq(listing.spec.patternCount, 1);
        assertEq(listing.spec.patternNibbles, 4);
        assertEq(listing.price, 0.05 ether);
        assertEq(listing.bond, 1 ether);
        assertEq(listing.seller, address(this));
        assertEq(listing.buyer, address(0));
    }

    function test_RequestGetterKeepsNestedSpec() public {
        bytes32 initCodeHash = keccak256("payload");
        maras.postRequest{value: 0.2 ether}(_spec(), initCodeHash);

        Maras.Request memory request = maras.getRequest(0);

        assertEq(request.spec.minZeroBytes, 3);
        assertEq(request.spec.hookMask, 0x2400);
        assertEq(request.spec.patternCount, 1);
        assertEq(request.initCodeHash, initCodeHash);
        assertEq(request.bounty, 0.2 ether);
        assertEq(request.buyer, address(this));
        assertFalse(request.filled);
    }

    function test_DeliveryWindowIsTenMinutes() public view {
        assertEq(maras.DELIVERY_WINDOW(), 10 minutes);
    }

    /// @dev A buyer should be able to read what the seller claimed, rather than guessing from
    /// the address which of its features it was mined for.
    function test_NamedListingKeepsTheDeclaredSpec() public {
        Maras.Spec memory spec;
        spec.minZeroBytes = 0;
        spec.patterns[0] = bytes4(uint32(0x0000cafe));
        spec.patternCount = 1;
        spec.patternNibbles = 4;

        bytes32 salt = _saltContaining("cafe");

        maras.commitSalt(keccak256(abi.encode(salt, address(this))));
        vm.roll(block.number + 1);
        maras.listNamed(salt, 0.01 ether, spec);

        Maras.NamedListing memory listing = maras.getNamedListing(0);

        assertEq(listing.spec.patternCount, 1);
        assertEq(listing.spec.patterns[0], bytes4(uint32(0x0000cafe)));
        assertEq(listing.spec.patternNibbles, 4);
        assertEq(listing.price, 0.01 ether);
    }

    /// @dev Grinds for an address the contract will accept, mirroring what the miner does.
    function _saltContaining(string memory word) internal view returns (bytes32) {
        Maras.Spec memory spec;
        spec.patterns[0] = bytes4(uint32(0x0000cafe));
        spec.patternCount = 1;
        spec.patternNibbles = 4;
        word; // the spec above is the machine-readable form of it

        for (uint256 attempt = 0; attempt < 500_000; attempt++) {
            bytes32 salt = bytes32(attempt);
            if (_contains(maras.predictAddress(salt))) return salt;
        }
        revert("no matching salt found");
    }

    function _contains(address addr) internal pure returns (bool) {
        uint256 value = uint160(addr);
        for (uint256 shift = 0; shift <= 144; shift += 4) {
            if (((value >> shift) & 0xffff) == 0xcafe) return true;
        }
        return false;
    }
}
