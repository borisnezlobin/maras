// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import {OwnedProxy} from "./templates/OwnedProxy.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Slot 0 holds the count, the same slot a naive proxy would keep its owner in.
contract Counter {
    uint256 public count;

    function increment() external {
        count += 1;
    }

    function setCount(uint256 value) external {
        count = value;
    }
}

contract CounterWithReset {
    uint256 public count;

    function increment() external {
        count += 1;
    }

    function reset() external {
        count = 0;
    }
}

contract SlotZeroWriter {
    address public first;

    function writeFirst(address value) external {
        first = value;
    }
}

contract OwnedProxyTest is Test {
    bytes32 constant IMPLEMENTATION_SLOT = bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 constant ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    address stranger = address(0xBAD);
    OwnedProxy proxy;
    Counter counter;

    function setUp() public {
        proxy = new OwnedProxy(address(this));
        counter = new Counter();
    }

    function test_OwnerIsTheConstructorArgument() public view {
        assertEq(proxy.proxyOwner(), address(this));
        assertEq(proxy.proxyImplementation(), address(0));
    }

    function test_RejectsAZeroOwner() public {
        vm.expectRevert(OwnedProxy.ZeroOwner.selector);
        new OwnedProxy(address(0));
    }

    function test_TakesEtherBeforeItPointsAnywhere() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = payable(address(proxy)).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(proxy).balance, 1 ether);
    }

    function test_RejectsCallsBeforeItPointsAnywhere() public {
        vm.expectRevert(OwnedProxy.NoImplementation.selector);
        Counter(address(proxy)).increment();
    }

    function test_OnlyTheOwnerCanPointIt() public {
        vm.prank(stranger);
        vm.expectRevert(OwnedProxy.NotOwner.selector);
        proxy.pointTo(address(counter), "");
    }

    function test_RefusesToPointAtAnAddressWithNoCode() public {
        vm.expectRevert(OwnedProxy.NotAContract.selector);
        proxy.pointTo(address(0xBEEF), "");
    }

    function test_ForwardsCallsIntoItsOwnStorage() public {
        proxy.pointTo(address(counter), "");

        Counter(address(proxy)).increment();
        Counter(address(proxy)).increment();

        assertEq(Counter(address(proxy)).count(), 2);
        assertEq(counter.count(), 0);
    }

    function test_SetupRunsAgainstTheNewImplementation() public {
        proxy.pointTo(address(counter), abi.encodeCall(Counter.setCount, (7)));
        assertEq(Counter(address(proxy)).count(), 7);
    }

    function test_ImplementationStorageCannotOverwriteTheOwner() public {
        SlotZeroWriter writer = new SlotZeroWriter();
        proxy.pointTo(address(writer), "");

        SlotZeroWriter(address(proxy)).writeFirst(stranger);

        assertEq(SlotZeroWriter(address(proxy)).first(), stranger);
        assertEq(proxy.proxyOwner(), address(this));
    }

    function test_RepointingKeepsTheAddressAndItsState() public {
        proxy.pointTo(address(counter), "");
        Counter(address(proxy)).increment();

        proxy.pointTo(address(new CounterWithReset()), "");

        assertEq(CounterWithReset(address(proxy)).count(), 1);
        CounterWithReset(address(proxy)).reset();
        assertEq(CounterWithReset(address(proxy)).count(), 0);
    }

    function test_TransferHandsOverControl() public {
        proxy.transferProxyOwnership(stranger);
        assertEq(proxy.proxyOwner(), stranger);

        vm.expectRevert(OwnedProxy.NotOwner.selector);
        proxy.pointTo(address(counter), "");

        vm.prank(stranger);
        proxy.pointTo(address(counter), "");
        assertEq(proxy.proxyImplementation(), address(counter));
    }

    function test_CannotTransferToTheZeroAddress() public {
        vm.expectRevert(OwnedProxy.ZeroOwner.selector);
        proxy.transferProxyOwnership(address(0));
    }

    function test_KeepsOwnerAndImplementationInTheStandardSlots() public {
        proxy.pointTo(address(counter), "");

        assertEq(address(uint160(uint256(vm.load(address(proxy), ADMIN_SLOT)))), address(this));
        assertEq(address(uint160(uint256(vm.load(address(proxy), IMPLEMENTATION_SLOT)))), address(counter));
    }
}
