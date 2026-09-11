"use client";

import { useEffect, useRef } from "react";
import type { BaseError } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export interface TransactionState {
  signing: boolean;
  confirming: boolean;
  confirmed: boolean;
  error: string | null;
}

/**
 * One write and its receipt. `onConfirmed` fires once the receipt lands, so a caller can refetch
 * whatever the transaction changed; it is read through a ref so a new callback on every render
 * cannot fire it twice.
 */
export function useTransaction(onConfirmed?: () => void) {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const latest = useRef(onConfirmed);

  useEffect(() => {
    latest.current = onConfirmed;
  });

  useEffect(() => {
    if (receipt.isSuccess) latest.current?.();
  }, [receipt.isSuccess]);

  const failure = (writeError ?? receipt.error) as BaseError | null;
  const state: TransactionState = {
    signing: isPending,
    confirming: receipt.isLoading,
    confirmed: receipt.isSuccess,
    error: failure === null ? null : (failure.shortMessage ?? failure.message),
  };

  return { writeContract, state };
}

export function transactionLabel(state: TransactionState, idle: string, working: string): string {
  if (state.signing) return "Confirm in your wallet";
  if (state.confirming) return working;
  return idle;
}
