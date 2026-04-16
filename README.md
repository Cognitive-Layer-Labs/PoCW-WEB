# PoCW-WEB Frontend

Next.js frontend for PoCW verification flow. Browser traffic goes to internal frontend API routes, and the server-side proxy calls Oracle with bearer auth. Contract addresses are selected by wallet chainId.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local env from the template:

```bash
cp sample.env .env.local
```

3. Update local values in `.env.local`.

4. Start dev server:

```bash
npm run dev
```

Default UI URL: `http://localhost:3001`

## Environment Variables

### Required frontend vars

- Server-only:
  - `POCW_ORACLE_BASE_URL`
  - `POCW_API_KEY`
- Browser-visible:
  - `NEXT_PUBLIC_CONTROLLER_ADDRESS_31337` and `NEXT_PUBLIC_SBT_ADDRESS_31337` for local hardhat
  - `NEXT_PUBLIC_CONTROLLER_ADDRESS_84532` and `NEXT_PUBLIC_SBT_ADDRESS_84532` for Base Sepolia testnet

### Why NEXT_PUBLIC_ and server-only vars both exist

In Next.js, only variables prefixed with `NEXT_PUBLIC_` are exposed to browser code.

`POCW_API_KEY` is a secret and must stay server-only (no `NEXT_PUBLIC_` prefix). The browser never sends this key directly.

## Which env file for Local vs Testnet/Mainnet

- Local development (`npm run dev`): use `.env.local`
- Testnet or mainnet deployment builds (`npm run build` then `npm start`): use `.env.production`

Because these values are compiled into the frontend at build time, always rebuild after env changes.

## Detailed Deployment Env Modes

<details>
  <summary>Local development mode (.env.local)</summary>

Use when running local node and local oracle service.

Recommended values:
- `POCW_ORACLE_BASE_URL=http://localhost:3000`
- `POCW_API_KEY=<same value as oracle-service POCW_API_KEY>`
- `NEXT_PUBLIC_CONTROLLER_ADDRESS_31337=<local PoCW_Controller address>`
- `NEXT_PUBLIC_SBT_ADDRESS_31337=<local PoCW_SBT address>`

Flow:
1. Start local chain and deploy contracts.
2. Start oracle service locally.
3. Start frontend with `npm run dev`.
4. Connect wallet to chain `31337`.

Notes:
- Local addresses can change after redeploy.
- Update `.env.local` whenever local contracts are redeployed.
- Browser calls go to `/api/oracle/*`; frontend proxy injects bearer token.

</details>

<details>
  <summary>Testnet staging mode (.env.production with Base Sepolia)</summary>

Use when deploying staging/preview to VPS against Base Sepolia.

Recommended values:
- `POCW_ORACLE_BASE_URL=https://oracle.yourdomain.com`
- `POCW_API_KEY=<shared bearer secret>`
- `NEXT_PUBLIC_CONTROLLER_ADDRESS_84532=<Base Sepolia Controller>`
- `NEXT_PUBLIC_SBT_ADDRESS_84532=<Base Sepolia SBT>`

Flow:
1. Deploy contracts to Base Sepolia in contracts repo.
2. Deploy oracle API on VPS with testnet config.
3. Set frontend `.env.production` with testnet addresses.
4. Build frontend (`npm run build`) and run (`npm start`).
5. Connect wallet to Base Sepolia (`84532`).

Notes:
- Use HTTPS domain for oracle backend.
- Frontend and oracle can be on different subdomains.
- Browser should call frontend domain only; frontend server calls oracle domain.

</details>

<details>
  <summary>Mainnet production mode (.env.production with Base mainnet)</summary>

Use when deploying production against Base mainnet.

Recommended values:
- `POCW_ORACLE_BASE_URL=https://oracle.yourdomain.com`
- `POCW_API_KEY=<shared bearer secret>`
- `NEXT_PUBLIC_CONTROLLER_ADDRESS_8453=<Base Mainnet Controller>`
- `NEXT_PUBLIC_SBT_ADDRESS_8453=<Base Mainnet SBT>`

Important:
- The current frontend chain map in `src/lib/contracts.ts` includes `31337` and `84532`.
- Add chain `8453` there before expecting mainnet addresses to resolve.

Flow:
1. Deploy audited contracts to Base mainnet.
2. Configure production oracle with production wallet and strict security.
3. Set `.env.production` to mainnet values.
4. Build and restart frontend.
5. Connect wallet to Base mainnet (`8453`).

Notes:
- Treat mainnet as immutable release process.
- Require explicit release checklist and rollback plan.

</details>

## Runtime Address Selection

Frontend picks contract addresses based on connected wallet chainId:

- chain `31337` -> reads `NEXT_PUBLIC_*_31337`
- chain `84532` -> reads `NEXT_PUBLIC_*_84532`
- unknown chain -> uses zero address fallback and UI warns deployment is missing

If users switch networks in wallet, app switches target addresses automatically.

## Troubleshooting

- "Contract not deployed on this chain": missing env pair for connected chainId.
- Oracle API proxy 401: `POCW_API_KEY` mismatch between frontend and oracle-service.
- Oracle API proxy 500: missing `POCW_API_KEY` or `POCW_ORACLE_BASE_URL` in frontend server env.
- Oracle API proxy 502: frontend cannot reach oracle URL from server runtime.
- Changed env but app still old: rebuild frontend after env update.

## Security Notes

- Do not put secrets in `NEXT_PUBLIC_*` vars.
- Keep `POCW_API_KEY` server-only in frontend env and oracle-service env.
- Use HTTPS for public oracle endpoint in testnet/mainnet.

## Auth Migration Verification

1. Direct oracle request without token should fail (expected 401):

```bash
curl -i https://your-oracle-domain/api/index
```

2. Frontend flow through proxy should succeed (expected 200 on normal flow):
- Start frontend with `POCW_ORACLE_BASE_URL` and `POCW_API_KEY` set.
- Run upload/index/verify flow from UI.
- Confirm browser network requests target frontend `/api/oracle/*` endpoints.

3. Secret exposure check:
- Ensure `POCW_API_KEY` is absent from browser devtools request headers to oracle domain.
- Ensure no `NEXT_PUBLIC_POCW_API_KEY` exists.
