import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PAYLOADS = ["ownedProxyBytecode", "ownedVaultBytecode"];

function bytecodeIn(path: string, name: string): string | undefined {
  return readFileSync(path, "utf8").match(new RegExp(`${name} = "(0x[0-9a-fA-F]+)"`))?.[1];
}

/**
 * A buyer binds a payload's hash through the web app, and a seller rebuilds the payload through
 * the node scripts. Bytecode carries a compiler metadata hash that shifts between compiles, so if
 * only one generated module is refreshed the two sides build different code and every fill
 * reverts with CodeHashMismatch.
 */
describe("payload bytecode", function () {
  it("is identical in the buyer's web module and the seller's node module", function () {
    for (const name of PAYLOADS) {
      const web = bytecodeIn("web/lib/maras.generated.ts", name);
      const node = bytecodeIn("shared/generated/abi.ts", name);
      assert.ok(web !== undefined, `${name} is missing from web/lib/maras.generated.ts`);
      assert.equal(web, node, `${name} differs between the web and node modules; regenerate both`);
    }
  });
});
