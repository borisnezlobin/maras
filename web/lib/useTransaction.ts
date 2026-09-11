"use client";

import { useEffect, useRef, useState } from "react";
import {
  encodeFunctionData,
  toHex,
  type Abi,
  type Address,
  type BaseError,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { CHAIN_ID } from "@/lib/maras.generated";

interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface TransactionState {
  signing: boolean;
  confirming: boolean;
  confirmed: boolean;
  error: string | null;
  /** The error, or a nudge toward the wallet once it has sat on a request for a while. */
  message: string | null;
  hash: Hex | undefined;
}

const WALLET_SILENCE_MS = 12_000;
const WALLET_SILENCE =
  "Nothing from your wallet yet. Open MetaMask from the toolbar: the request may be waiting there without a popup.";

function describeFailure(failure: { shortMessage?: string; message?: string } | null): string | null {
  if (failure === null) return null;
  const message = failure.shortMessage ?? failure.message ?? "The transaction failed.";
  if (/reject|denied|cancel/i.test(message)) return "Cancelled in your wallet.";
  return message;
}

/**
 * One write and its receipt. Each caller gets its own, so a pending purchase on one card leaves
 * every other card alone.
 *
 * The call goes to the wallet as a bare `eth_sendTransaction`. Routing it through the usual
 * client first ran gas and fee estimation over the wallet's own RPC before the wallet was ever
 * asked, and when that RPC stalled MetaMask never opened at all. The wallet estimates gas itself.
 * It is moved to Base Sepolia first, since on another network the call would reach an address
 * with no contract behind it.
 */
export function useTransaction(onConfirmed?: () => void) {
  const { address: account, chainId, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContract } = useWriteContract();
  const [hash, setHash] = useState<Hex | undefined>(undefined);
  const [signing, setSigning] = useState(false);
  const [failure, setFailure] = useState<{ shortMessage?: string; message?: string } | null>(null);
  const [waitingLong, setWaitingLong] = useState(false);
  const receipt = useWaitForTransactionReceipt({ hash, chainId: CHAIN_ID });
  const latest = useRef(onConfirmed);

  useEffect(() => {
    latest.current = onConfirmed;
  });

  useEffect(() => {
    if (receipt.isSuccess) latest.current?.();
  }, [receipt.isSuccess]);

  useEffect(() => {
    if (!signing) return;
    const timer = setTimeout(() => setWaitingLong(true), WALLET_SILENCE_MS);
    return () => {
      clearTimeout(timer);
      setWaitingLong(false);
    };
  }, [signing]);

  async function sendNow(call: ContractCall) {
    if (connector === undefined || account === undefined) throw new Error("Connect a wallet first.");
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID });

    const provider = (await connector.getProvider()) as EIP1193Provider;
    const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as never);
    const request = { from: account, to: call.address, data, ...(call.value === undefined ? {} : { value: toHex(call.value) }) };
    return provider.request({ method: "eth_sendTransaction", params: [request] });
  }

  // Typed as wagmi's own writeContract, so each call site keeps its ABI-checked function,
  // arguments and payable value.
  const send = ((call: ContractCall) => {
    setFailure(null);
    setHash(undefined);
    setSigning(true);
    sendNow(call)
      .then(setHash)
      .catch((error: { shortMessage?: string; message?: string }) => setFailure(error))
      .finally(() => setSigning(false));
  }) as unknown as typeof writeContract;

  const error = describeFailure(failure ?? (receipt.error as BaseError | null));
  const state: TransactionState = {
    signing,
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
