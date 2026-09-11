# Maras web app

Front end for the Maras marketplace. See the [root README](../README.md) for what the project is, the
mechanism, and the trust assumptions.

```bash
pnpm --dir web dev     # development server on http://localhost:3000
pnpm --dir web build   # production build
```

The contract address and ABI are not hand-written here. `lib/maras.generated.ts` is emitted by
`scripts/gen-web-abi.ts` in the repo root, which reads the compiled artifacts and the deployment
record. Regenerate it after deploying:

```bash
npx tsx scripts/gen-web-abi.ts
```

Until the contract is deployed, `MARAS_ADDRESS` is `null` and the listings section explains what to
run instead of failing.

Colour, type, spacing and radii are defined once as semantic tokens in `app/globals.css` and consumed
through Tailwind utilities. Shared primitives live in `components/ui.tsx`.
