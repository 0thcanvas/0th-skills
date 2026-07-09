# Skills Kernel Pilot Verification

**Date:** 2026-07-09
**Branch:** `feat/skills-kernel-pilot`
**Scope:** baseline, executable host capability layer, and migrated `build` pilot

## Before / after

| Measure | Baseline | Pilot |
|---|---:|---:|
| `skills/build/SKILL.md` lines | 415 | 124 |
| `skills/build/SKILL.md` words | 3,210 | 1,018 |
| Named Codex worker/reviewer mandates in portable `build` | 5 | 0 |
| Canonical five-section memory block embedded in `build` | yes | no |
| Default execution | mandatory role choreography | one root agent |
| Delegation authority | requested profile prose | observed capability record plus bounded packet |

The pilot reduced the hot skill by 70.1% of lines and 68.3% of words while preserving existing proof, secret, specialist, visual, product-acceptance, and memory contract tests.

## Executable capability proof

Command:

```bash
node scripts/0th.mjs capabilities \
  --harness codex \
  --runtime-json tests/fixtures/skills-kernel/codex-runtime-observed.json \
  --packet-json tests/fixtures/skills-kernel/read-only-packet.json \
  --now 2026-07-09T20:00:00Z
```

Observed decision:

- model: `gpt-5.6-sol`
- reasoning effort: `xhigh`
- model override: unavailable
- effort override: unavailable
- routing result: `single-root`
- rejection: `disproportionate_inherited_effort`

The same router rejects documented-only capabilities, stale observations, ordered work, unavailable requested effort, and shared mutable work without workspace isolation. An observed medium-effort independent read-only worker remains eligible.

## Verification

- Focused build compatibility suite: 60 passed, 0 failed.
- Full repository suite: 383 passed, 0 failed.
- Plugin repository smoke check: passed for version 0.3.2.
- Public capability CLI: exited 0 and emitted the expected conservative routing decision.

## Migration gate

**Status: PARTIAL.** Static contracts, compatibility, packaging, and T1 CLI behavior pass. The representative eight-task corpus has not yet been replayed through fresh baseline and pilot sessions, so this evidence does not establish quality, token, latency, or human-review improvements. Do not migrate the remaining skills until Slice 3 performs those behavioral ablations.

This pilot is committed on `feat/skills-kernel-pilot` only. The installed plugin cache remains unchanged until the behavioral gate passes and the release slice verifies source/cache parity.
