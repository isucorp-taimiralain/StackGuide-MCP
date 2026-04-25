# Command: Release — Publish a version

Reusable prompt to activate agent `04-releaser`.

## Prompt

```
Act as the "Releaser" agent.
Load these skills: mr-conventions and stack-postgres-migrations.

Target version: vX.Y.Z

Goal:
1. Preflight: confirm green pipeline on main and no blocker MRs.
2. Determine correct SemVer from commits in range.
3. Generate release notes grouped by type.
4. Commit release artifacts if any (changelog/versioning).
5. Push the release branch and the tag.
6. Create a Release with the tag and final notes.
7. Document deployment steps and rollback if there are migrations.

Do not tag on red CI. Do not force push or destructive rebase.

Close with: "Release vX.Y.Z published" only when the tag exists and the Release is created.
```

## Expected result

- Complete release notes.
- Evidence of full execution (commit and push done, remote tag exists, release created).
- Breaking changes list (if any) with migration path.
