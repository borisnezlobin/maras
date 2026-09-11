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
}
