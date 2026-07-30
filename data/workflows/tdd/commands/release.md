# Command: Release — Publish MR / version

Reusable prompt to activate agent `04-releaser`.
OJ-aware: ships evidence from Verify; no separate OJ command. Policy: `.stackguide/oj.md`.

## Prompt

```
Act as the "Releaser" agent.
Load skills: mr-conventions, oj-health, and stack-postgres-migrations if needed.

Context:
- Default: open the feature MR to the base branch after Verifier PASS.
- SemVer tag only when the user asks for vX.Y.Z.

## Feature MR (default after verify)
1. Confirm Verifier Report includes:
   - OJ (changed vs <base-branch>): PASS | skipped
   - Ponytail line
   FAIL → stop; send back to verify/implement. Do not open the MR.
2. Open/update the MR targeting the base branch. In Test plan paste:
   - [ ] OJ (changed vs <base-branch>): PASS | FAIL | skipped
   - [ ] Ponytail review: done | n/a
3. If the branch adds contract exceptions[], list each in Out of scope with cleanup PR + expires.
4. Do not add OJ CI/scripts outside .stackguide.
5. Do not ship a .repo-health.json loosen without an explicit follow-up.

## SemVer tag (only if user set Target version: vX.Y.Z)
1. Preflight: green pipeline on base branch; no blocker MRs.
2. SemVer from conventional commits; notes grouped by type.
3. Commit release artifacts if any; push branch + annotated tag; create Release.
4. Never tag on red CI; never force push.

Close with:
- Feature MR: "MR ready / opened — OJ evidence included"
- Tag: "Release vX.Y.Z published" only when tag + Release exist.
```

## Expected result

- MR (or release) with OJ + Ponytail evidence from the same verify → release chain.
- No contract loosen without follow-up.
- No new commands; release stays the fifth step.
