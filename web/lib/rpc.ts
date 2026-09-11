import { fallback, http } from "viem";

/**
 * Base Sepolia's default endpoint rate-limits a caller that reads sixty-odd listings in a burst,
 * and a throttled read surfaces as an error on the page rather than as a retry. Reads therefore
 * spread across several public providers and fail over to the next one.
 */
const ENDPOINTS = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
  "https://base-sepolia.drpc.org",
];

export function baseSepoliaTransport() {
  return fallback(ENDPOINTS.map((url) => http(url)));
}
