# Alpha 0.10E — Iron Gate internal security review
Date: 2026-11-27 UTC. Scope: protected staging, simulation-only economy. Not an independent audit or production approval.

## Verified changes
- First-player initialization: accept successful PostgREST return=minimal empty HTTP 201; reload player state. Both CJS adapter and hosted vault-game v4 patched.
- Atomic action commit: lock player row, verify expected revision and current UTC day/week, throttle committed non-rollover actions to at least 250 ms, write state and audit event atomically. Migration 20261127031130.
- Settlement freeze: reject prior distributions or unreconciled balances. Migration 20261127031236.
- Hosted rollback tests passed for initial commit, replay, rate limit, stale week, valid retry, audit count and prior simulated distribution guard. No persistent test records.
- Application CI 45932792776: 68/68. Contract CI 45932792778: 8/8, including overlapping reward epochs and independent lock positions. Contract code unchanged and undeployed.

## Blocking findings
- Dependency advisory scan 45932779165 FAILED. Root npm tree: 3 high severity findings (Zod <4.6.6 via @farcaster/quick-auth <=0.0.8 and @farcaster/miniapp-sdk). Audit output says no fix available for the resolved tree. Do not assume the bundled SDK or Edge Deno graph is clean; separately validate runtime reachability and patched compatible alternatives. Do not blindly force-upgrade or override incompatible major versions.
- Isolated contracts npm tree: 36 findings (2 low, 6 moderate, 23 high, 5 critical), including development/test dependencies. This is a dependency inventory, not 36 proven deployed-contract exploits. Replace or upgrade vulnerable test tooling, generate reviewed lockfiles and re-run tests/audits. Keep CI keyless and local simulation only.
- Supabase security advisors: leaked-password protection disabled (WARN), four intentional RLS-enabled/no-policy INFO findings on closed tables. Address Auth plan/configuration before public release.
- Authenticated end-to-end gameplay, wallet signatures, Farcaster Quick Auth and mobile playback/visual checks remain unverified.
- Rate limiting covers accepted game actions only, not rejected requests or all API routes; stronger account/IP abuse controls, bot/farm detection and monitoring are still required. Unique wallet links do not prove unique humans.
- Contract prototype assumes a verified mock asset and trusted publisher. Typed constructor arguments do not authenticate token bytecode. The gateway verifies exact creation/runtime and configuration but is not an audit. No rescue mechanism for accidental direct transfers, no publisher recovery, 100-recipient on-chain limit vs 1000-person simulated snapshot, and expiry policy require design review before even a funded pilot. No live Sepolia deployment.
- Ledger administrators can still directly write as privileged database owners; reconciliation is not protection from a compromised admin. Define role separation, approval policy, retention and backup/recovery.
- Dependency scan does not cover all Deno runtime imports. No comprehensive static/fuzz/independent smart-contract audit performed.

## Release decision
Keep staging access protection and simulation only. Hosted game backend fixes are deployed; no new frontend deployment or production promotion in this review. Existing Alpha 0.10D frontend remains in place. Do not enable payments, staking, deposits, or claims. Prioritize Alpha 0.10E.1 dependency remediation and authenticated E2E verification before moving to Guild Wars; financial launch needs separate independent audit and legal/compliance assessment.

## References
- https://github.com/GrandJiraiya/crash-out-vaults/actions/runs/45932779165
- https://github.com/GrandJiraiya/crash-out-vaults/actions/runs/45932792776
- https://github.com/GrandJiraiya/crash-out-vaults/actions/runs/45932792778
