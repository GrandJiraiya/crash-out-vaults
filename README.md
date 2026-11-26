# crash-out-vaults
Web 3 dApp. Enjoyable RPG with potential earning/staking.

## Vault Wars — Alpha 0.2
Free, local gameplay demonstration. No real payouts, staking, token transfers, or deployed smart contracts.

### Run
Open `index.html` in a modern browser, or run `python -m http.server 8080` from the repository directory and visit http://localhost:8080. For wallet testing, use a compatible injected EIP-1193 wallet on a trusted HTTPS deployment. No install or build is required.

### Gameplay
Choose Paladin, Assassin, or Warlock. Win dungeons for 20 points and 40 XP; defeat the weekly Hollow King (unlocked at level 2) for 60 points and 100 XP. Every 100 XP increases your level. At 100 weekly points, claim one fictional equipment upgrade. Weekly reset is Monday 00:00 UTC. Level and equipment persist locally. Alpha 0.2 adds weapons, armor and relics that modify combat stats. Daily quests: clear 3 dungeons (+15 contribution) and use 5 class skills (+10 contribution). Claim each once per UTC day. Gear can be equipped outside combat; existing v0.1 local saves migrate using defaults for new fields. Progress is stored in browser localStorage, is editable, and never qualifies for monetary rewards.

### Base configuration
- Mainnet chain ID: 8453
- User-supplied CRASHOUTCRYPTO token: `0xf7914587e79d23117ba5f4f9848d508d09fc4b99`
- GeckoTerminal pool ID: `0x7798a8fcc9bdc481d46f0d6f3a9aafb7907d975a6f2d5cde3a2997222b577ffc`
- Wallet connection requests account access and reads balanceOf and decimals on Base. No signatures, approvals or transfers. Forget wallet clears the interface connection, not wallet permissions.
- Full token identity and contract permissions must be independently verified before financial integration.

### Next milestones
1. Test gameplay and weekly rollover on desktop/mobile and compatible Base wallets.
2. Add Farcaster Mini App SDK, host-aware wallet connection, signed manifest and embed metadata on a public HTTPS deployment.
3. Implement authenticated, server-authoritative combat, progression and anti-abuse checks.
4. Develop testnet-only token locking and prefunded reward vaults, with invariant tests, independent audit and legal review before any mainnet financial functions.
5. Launch a free-entry beta and evaluate whether actual net game revenue supports a separately funded weekly reward pool.

### Security and economy
Never commit private keys, seed phrases or service credentials. Do not treat local demo scores as verified contributions. No promised APY, guaranteed payouts, paid random cash prizes or dependence on new token buyers. Token locking is optional and intended initially for cosmetics. Any cash reward program requires a funded treasury, published rules and eligibility, appropriate legal review and security testing.
