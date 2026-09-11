"use client";

import { useEffect, useRef, useState } from "react";
import type { BaseError, Hex } from "viem";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { CHAIN_ID } from "@/lib/maras.generated";

type WriteParameters = Parameters<ReturnType<typeof useWriteContract>["writeContract"]>[0];

export interface TransactionState {
  signing: boolean;
  confirming: boolean;
  confirmed: boolean;
  error: string | null;
  /** The error, or a nudge toward the wallet once it has sat on a request for a while. */
  message: string | null;
  hash: Hex | undefined;
}

// MetaMask can queue a request behind its toolbar icon without opening a window, which from the
// page looks exactly like a hang.
const WALLET_SILENCE_MS = 12_000;
const WALLET_SILENCE =
  "Nothing from your wallet yet. Open MetaMask from the toolbar: the request may be waiting there without a popup.";

function describeFailure(failure: BaseError | null): string | null {
  if (failure === null) return null;
  const message = failure.shortMessage ?? failure.message;
  if (/reject|denied|cancel/i.test(message)) return "Cancelled in your wallet.";
  return message;
}

/**
 * One write and its receipt. Each caller gets its own, so a pending purchase on one card leaves
 * every other card alone.
 *
 * A wallet left on another network would send the call to an address with no contract behind
 * it, so the wallet is moved to Base Sepolia first and the write is pinned there. `onConfirmed`
 * fires once the receipt lands; it is read through a ref so a new callback on every render
 * cannot fire it twice.
 */
export function useTransaction(onConfirmed?: () => void) {
  const { chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID });
  const [switchError, setSwitchError] = useState<BaseError | null>(null);
  const latest = useRef(onConfirmed);
  const [waitingLong, setWaitingLong] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setWaitingLong(true), WALLET_SILENCE_MS);
    return () => {
      clearTimeout(timer);
      setWaitingLong(false);
    };
  }, [isPending]);

  useEffect(() => {
    latest.current = onConfirmed;
  });

  useEffect(() => {
    if (receipt.isSuccess) latest.current?.();
  }, [receipt.isSuccess]);

  // Typed as wagmi's own writeContract, so each call keeps its ABI-checked function, arguments
  // and payable value instead of collapsing to one loose parameter type.
  const send = ((parameters: WriteParameters) => {
    setSwitchError(null);
    void (async () => {
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });
      } catch (error) {
        setSwitchError(error as BaseError);
        return;
      }
      writeContract({ ...parameters, chainId: CHAIN_ID } as WriteParameters);
    })();
  }) as typeof writeContract;

  const error = describeFailure((switchError ?? writeError ?? receipt.error) as BaseError | null);
  const state: TransactionState = {
    signing: isPending || switching,
    confirming: receipt.isLoading,
    confirmed: receipt.isSuccess,
    error,
    message: error ?? (waitingLong ? WALLET_SILENCE : null),
    hash,
  };

  return { writeContract: send, state };
}

export function transactionLabel(state: TransactionState, idle: string, working: string): string {
  if (state.signing) return "Confirm in your wallet";
  if (state.confirming) return working;
  return idle;
}
