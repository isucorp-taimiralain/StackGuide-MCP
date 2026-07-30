# TDD Agentic Workflow

Portable, stack-agnostic methodology for AI coding agents based on **Test-Driven Development** with **vertical slices**.

Originally inspired by the `.claude/` methodology from `inexsupport-new`, now generalized and lazy-loaded via the StackGuide MCP Server.

## Philosophy

- **Five roles** orchestrate every change: Intake → Planner → Implementer → Verifier → Releaser.
- **Lazy loading**: agents, skills, hooks and scripts are returned on demand through the MCP `workflow` tool.
- **Token-efficient**: only the role/skill currently needed is injected into context.
- **Stack-aware**: skills cover Laravel, React, Postgres migrations, VCS conventions and ticket traceability, but adapt to whatever StackGuide auto-detects.
- **Health-aware**: optional [OJ](https://github.com/WajoAI/OJ) repository-health gate woven into the same five commands (see `oj.md`).

## Structure

```
data/workflows/tdd/
├── agents/     # The five roles
├── skills/     # How-to guides invoked by the roles
├── hooks/      # POSIX shell scripts for local/CI validation (branch/commit format)
├── scripts/    # Runnable helpers (OJ gate, feature-branch creation)
├── commands/   # Ready-to-use prompt templates for each role
└── oj.md       # OJ health-gate policy (optional, skipped when no contract)
```

## Usage via MCP

```text
workflow action:"list"                                # Discover what is available
workflow action:"agent" name:"tdd-planner"            # Load planner role just-in-time
workflow action:"skill" name:"tdd-core"               # Pull the baseline TDD policy
workflow action:"skill" name:"oj-health"              # OJ gate rules per command
workflow action:"command" name:"plan"                 # Get a ready-to-copy prompt
workflow action:"hook" name:"check-branch-name"       # Retrieve the shell script
workflow action:"script" name:"tdd-feature-branch"    # Branch helper script
```

## Install into a project

```text
init action:"full"
```

`init` auto-detects your stack and copies only the relevant agents/skills/scripts into `.stackguide/` inside your project.

## Optional: OJ health gate

When a `.repo-health.json` / `.stackguide/repo-health.json` contract exists and OJ is installed, **verify** hard-gates the MR on changed-scope findings and **implement** runs an advisory pass. Without a contract or the `oj` binary, every command reports `OJ: ⏭ skipped` and continues — nothing blocks. Policy: `oj.md`, skill: `oj-health`, runner: `.stackguide/scripts/oj-verify.sh`.
