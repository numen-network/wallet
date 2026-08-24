# Numen Wallet

Browser wallet for the Numen chain, static SPA with no backend, keys never leave the browser.

- Accounts on one board, grouped and ordered however you like
- Send, receive, and watch balances
- Referenda, delegation, treasury spends, and bounties
- On chain identity, checked by a registrar
- Multisigs, proxies, and vesting schedules
- Numen added to MetaMask in one click, and EVM balances brought back to Substrate accounts

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

## What it does not do

- **Hardware wallets.** Ledger needs its own Numen app registered before the device will recognise anything this page hands it.
- **Ethereum signing.** Contract calls and ERC20 tokens stay MetaMask's job, and the balance shown here is the native one.

## Security

No backend, ever. A server in this design is a server that can receive a key.

Keys the wallet holds itself sit encrypted in the browser, in the polkadot-js keystore format. Nothing caches a decrypted one, so every signature costs a password. A browser extension works too, and keeps its keys to itself.

The CSP in `index.html` blocks remote scripts. Every dependency is attack surface and gets read before it lands.
