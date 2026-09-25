# Numen Wallet

Browser wallet for the Numen chain, static SPA with no backend, keys never leave the browser.

- Accounts on one board, grouped and ordered however you like
- Send, receive, and watch balances
- Referenda, delegation, treasury spends, and bounties
- On chain identity, checked by a registrar
- Multisigs, proxies, and vesting schedules
- Validator seats and session keys
- Numen added to MetaMask in one click, and EVM balances brought back to Substrate accounts
- ERC20 transfers from EVM accounts, signed in MetaMask

## Running it

```bash
pnpm install
pnpm dev
```

The UI starts against a local node at `ws://127.0.0.1:9944`. The endpoint picker in the header switches networks and remembers the choice. Mainnet, testnet, and local ship with it, and any other node can be added.

With no node running, copy `.env.example` to `.env` and a mock chain answers instead.

```bash
pnpm typecheck   # tsc, must be clean before every commit
pnpm test        # vitest
pnpm test:live   # the suite that needs a node running
pnpm e2e         # playwright, needs `pnpm exec playwright install chromium` once
pnpm build       # tsc then vite build
```

## Deploying

The wallet runs on Cloudflare Workers as static assets. `wrangler.jsonc` points the Worker at `dist/`.

1. In the Cloudflare dashboard, go to **Workers & Pages** > **Create application** > **Import a repository** and pick this repo.
2. Name the Worker `wallet`. It has to match `name` in `wrangler.jsonc`, or the build fails.
3. Set the build command to `pnpm run build` and leave the deploy command as `npx wrangler deploy`.
4. Add the build variable `PNPM_VERSION=11.20.0`. Cloudflare's default pnpm is too old for this repo, and the install fails with `packages field missing or empty`.
5. Select **Save and Deploy**.
6. Under **Settings** > **Domains & Routes**, add `wallet.numen-network.org` and `testnet.wallet.numen-network.org` as custom domains.

Every push to `master` redeploys the Worker. Both domains serve the same build. `HOSTS` in `src/chain/config.ts` maps each hostname to the network the wallet opens on. Any other host, `workers.dev` included, falls back to the local node.

## Local node

The wallet hosted on numen-network.org needs your browser's permission to reach a node on your own machine. Chrome and Edge ask for it when the page first connects to `ws://127.0.0.1:9944`. If you dismissed or blocked the prompt, open Site settings from the icon left of the URL and set **Apps on device** to **Allow**. Older versions call it **Local network access**.

None of this applies to the wallet `pnpm dev` serves from localhost, or to public endpoints.

## What it does not do

- **Hardware wallets.** Ledger needs its own Numen app registered before the device will recognise anything this page hands it.
- **Ethereum signing.** MetaMask holds the EVM keys and signs the token transfers and withdrawals the wallet builds. Other contract calls stay in MetaMask.

## Security

No backend, ever. A server in this design is a server that can receive a key.

Keys the wallet holds itself sit encrypted in the browser, in the polkadot-js keystore format. Nothing caches a decrypted one, so every signature costs a password. A browser extension works too, and keeps its keys to itself.

The CSP in `index.html` blocks remote scripts. Every dependency is attack surface and gets read before it lands.
