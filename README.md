# crash-out-vaults
Web 3 dApp. Enjoyable RPG with potential earning/staking.

## Vault Wars — Alpha 0.6
Free, local gameplay demonstration. No real payouts, staking, token transfers, or deployed smart contracts.

### Run
Open `index.html` in a modern browser, or run `python -m http.server 8080` from the repository directory and visit http://localhost:8080. For wallet testing, use a compatible injected EIP-1193 wallet on a trusted HTTPS deployment. The plain browser game requires no build. For the full Farcaster-enabled distribution, run `npm install`, `npm test`, and `npm run build`; serve `dist/` over HTTPS. The SDK is pinned to 0.4.0 and copied into the deployment, rather than loaded from a third-party CDN. Commit a reviewed lockfile before public deployment. Tests use Node's built-in runner and a simulated DOM; real browser and wallet testing are still required.

### Gameplay
Choose Paladin, Assassin, or Warlock. Choose Sentinel Crypt (level 1: 20 points, 40 XP), Ashen Depths (level 3: 35 points, 65 XP), or Void Citadel (level 5: 50 points, 90 XP); defeat the weekly Hollow King (unlocked at level 2) for 60 points and 100 XP. Every 100 XP increases your level. Alpha 0.4 limits recovery to two charges per encounter, shows the class skill cooldown, rejects invalid combat actions, and gives Assassin a stronger skill damage bonus. At 100 weekly points, claim one fictional equipment upgrade. Weekly reset is Monday 00:00 UTC; a countdown shows time remaining. Level and equipment persist locally. Alpha 0.2 adds weapons, armor and relics that modify combat stats. Daily quests: clear 3 dungeons (+15 contribution) and use 5 class skills (+10 contribution). Claim each once per UTC day. Gear can be equipped outside combat; existing v0.1 local saves migrate using defaults for new fields. Progress is stored in browser localStorage, is editable, and never qualifies for monetary rewards.

### Base configuration
- Mainnet chain ID: 8453
- User-supplied CRASHOUTCRYPTO token: `0xf7914587e79d23117ba5f4f9848d508d09fc4b99`
- GeckoTerminal pool ID: `0x7798a8fcc9bdc481d46f0d6f3a9aafb7907d975a6f2d5cde3a2997222b577ffc`
- Wallet connection requests account access and reads balanceOf and decimals on Base. No signatures, approvals or transfers. Forget wallet clears the interface connection, not wallet permissions.
- Full token identity and contract permissions must be independently verified before financial integration.

### Next milestones
1. Test gameplay and weekly rollover on desktop/mobile and compatible Base wallets.
2. Farcaster SDK host detection, ready signal and host-aware wallet selection are implemented in source; verify build and behavior. Generate and sign the domain-specific manifest and embed metadata after choosing the public HTTPS domain. Host identity is not authenticated yet; implement server-side verification before using any FID for rewards.
3. Implement authenticated, server-authoritative combat, progression and anti-abuse checks.
4. Develop testnet-only token locking and prefunded reward vaults, with invariant tests, independent audit and legal review before any mainnet financial functions.
5. Launch a free-entry beta and evaluate whether actual net game revenue supports a separately funded weekly reward pool.

### Security and economy
Never commit private keys, seed phrases or service credentials. Do not treat local demo scores as verified contributions. No promised APY, guaranteed payouts, paid random cash prizes or dependence on new token buyers. Token locking is optional and intended initially for cosmetics. Any cash reward program requires a funded treasury, published rules and eligibility, appropriate legal review and security testing.

## Deployment
Vercel configuration runs regression tests before building the static `dist/` directory. Import the repository into the intended Vercel team, run a preview build, test it, and only then publish. A signed Farcaster manifest requires the final domain and account owner's authorization. Selected workspace: crashoutcrypto. Vercel project creation remains blocked by the workspace billing suspension (402 on retry after the reported payment update); no live deployment or signed manifest has been created yet.

### Alpha 0.5: server-authoritative development mode
Run `npm run dev:server` and open http://127.0.0.1:8080. The separate server-backed UI sends only an action, optional choice and expected revision. The server owns progression, class and equipment rules, UTC resets, and claims. A random HttpOnly session cookie identifies a local save; state is stored in ignored .local-data files with atomic replacement. Concurrent/stale requests fail revision checks. Browser saves from the static demo are deliberately not imported. The static Vercel preview remains Alpha 0.4 gameplay and is not server-backed. This is a single-process loopback development server, not a production service. Before cloud use, implement durable transactional database storage, verified wallet/Farcaster identity, request rate limits, abuse detection, and server-side monitoring; no financial claims may use this prototype.

### Alpha 0.6: dedicated Supabase development database
Project ref: hjyxzugqkihtlewculpu (US East Ohio), URL https://hjyxzugqkihtlewculpu.supabase.co. Migration `20261126222112_vault_player_state_and_atomic_action_log.sql` is applied. Both tables have RLS; authenticated users may read only their own state and cannot mutate it. The action log is intentionally inaccessible to clients; the security advisor reports an informational no-policy notice for it. Only service_role can invoke the atomic compare-and-swap function. A nonexistent-player commit returned false in hosted SQL verification.
The server-only `server/supabase-store.cjs` adapter validates the user's Supabase access token with Auth, derives user identity from the response, rejects anonymous accounts and uses the engine to calculate changes before atomic commit. Configure the URL, publishable key and a server-only legacy service-role JWT when wiring a hosted API; never commit credentials. The adapter is not yet wired to a public endpoint or UI, and its tests mock HTTP. Auth providers, actual user end-to-end testing, rate limits and rankings remain pending. No real money, token locking or payouts are enabled.
