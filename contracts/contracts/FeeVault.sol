// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPonsFeeEscrow} from "./interfaces/IPonsV2.sol";

interface IArcadePadSink {
    function deposit() external payable;
}

/**
 * One per launch: the token's creator-fee recipient on Pons.
 *
 * Pons credits creator fees to the recipient in its fee escrow; the escrow
 * only pays the recipient itself. So every cabinet gets its own tiny
 * recipient whose only ability is to claim from the escrow and hand the
 * ETH to the pad, which splits it (creator / pot / pad). Nobody — not the
 * creator, not the pad owner — can point the fees anywhere else: the
 * vault has no owner and no other function.
 */
contract FeeVault {
    IArcadePadSink public immutable pad;
    IPonsFeeEscrow public immutable escrow;

    error NothingToCollect();

    constructor(IPonsFeeEscrow escrow_) {
        pad = IArcadePadSink(msg.sender);
        escrow = escrow_;
    }

    /// Anyone. Claims what the escrow holds for this vault and forwards
    /// everything the vault has to the pad.
    function collect() external returns (uint256 amount) {
        if (escrow.balanceOf(address(this)) > 0) escrow.claim();
        amount = address(this).balance;
        if (amount == 0) revert NothingToCollect();
        pad.deposit{value: amount}();
    }

    /// What a collect() would move right now: escrow credit plus anything
    /// sent here directly.
    function collectable() external view returns (uint256) {
        return escrow.balanceOf(address(this)) + address(this).balance;
    }

    receive() external payable {}
}
