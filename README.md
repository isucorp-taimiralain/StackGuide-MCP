# StackGuide MCP Server

Dynamic context loading for AI coding assistants. Works with **Cursor** and **GitHub Copilot**.

## Quick Start

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "stackguide": {
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`): Same config as above.

## Usage

Just talk naturally:

- *"Set up my project"* → Auto-configures with interactive wizard
- *"Review my code"* → Analyzes with Quick Fix suggestions
- *"Generate a component"* → Creates boilerplate code
- *"Check project health"* → Returns health score (A-F)
- *"Analyze my project"* → **NEW!** Auto-configuration intelligence
- *"Browse React rules"* → Shows community rules

## Tools (13 total)

### Core Tools
| Tool | Description | Example |
|------|-------------|---------|
| `setup` | Configure project with wizard | `setup` or `setup type:"react-typescript"` |
| `context` | View current configuration | `context` or `context full:true` |
| `rules` | List, search, get rules | `rules action:"search" query:"security"` |
| `knowledge` | Access patterns & solutions | `knowledge action:"get" query:"architecture"` |
| `review` | Review code with Quick Fixes | `review file:"src/index.ts" focus:"security"` |

### Advanced Features
| Tool | Description | Example |
|------|-------------|---------|
| `generate` | Generate boilerplate code | `generate type:"component" name:"UserCard"` |
| `health` | Project health score (A-F) | `health detailed:true` |
| `analyze` | **NEW!** Project intelligence | `analyze action:"full" path:"./my-project"` |

### Integration Tools
| Tool | Description | Example |
|------|-------------|---------|
| `cursor` | Browse cursor.directory | `cursor action:"browse" query:"react"` |
| `docs` | Fetch web documentation | `docs action:"fetch" url:"https://..."` |
| `config` | Save/load configurations | `config action:"save" name:"my-project"` |
| `custom_rule` | Create custom rules | `custom_rule action:"create" name:"..." content:"..."` |
| `help` | Get help | `help` or `help topic:"generate"` |

## New in v2.4.0: Advanced Features

### 🏭 Template Generator
Generate boilerplate for components, hooks, services, tests, API routes, models, and utilities:

```bash
generate type:"component" name:"UserCard"
generate type:"hook" name:"useAuth"  
generate type:"service" name:"ApiService"
generate type:"test" name:"UserCard" options:{"framework":"vitest"}
generate type:"api" name:"Users" options:{"framework":"nextjs"}
```

### 🔧 Quick Fix Suggestions
Code review now includes actionable Quick Fixes:

```
🔴 [SEC001] Avoid using eval() - it can execute arbitrary code
- Line: 15
- Code: `eval(userInput)`
- 🔧 Quick Fix: Replace eval() with JSON.parse()
  - Replace: `eval(` → With: `JSON.parse(`
```

### 🏥 Project Health Score
Get a comprehensive health analysis with grade (A-F):

```bash
health detailed:true
```

Returns:
- Overall score (0-100) with grade
- Category breakdown (Configuration, Code Quality, Structure, Docs, Testing)
- Critical issues and recommendations

### 🧙 Interactive Setup Wizard
Setup now provides tailored recommendations:

```json
{
  "wizard": {
    "recommendations": {
      "suggestedTools": ["ESLint", "Prettier", "TypeScript strict mode"],
      "vsCodeExtensions": ["ES7+ React snippets", "Error Lens"],
      "tips": ["Use functional components", "Memoize with useMemo"]
    },
    "nextSteps": ["Run `context`", "Run `review`", "Run `health`"]
  }
}
```

## New in v3.3.0: Auto-Configuration Intelligence 🧠

### Project Intelligence Analysis
Get comprehensive analysis with actionable recommendations:

```bash
analyze action:"full" path:"./my-project"
analyze action:"structure"     # Analyze only project structure
analyze action:"config"        # Analyze only configurations
analyze action:"dependencies"  # Analyze only dependencies
analyze action:"generate" configType:"eslint"  # Generate optimal config
analyze action:"apply"         # Apply all auto-fixes
```

Returns:
- **Overall Score (0-100)** with grade (A-F)
- **Structure Analysis**: Missing dirs/files, directory organization
- **Configuration Analysis**: Missing ESLint, Prettier, TSConfig recommendations
- **Dependency Analysis**: Missing packages, security advisories
- **Priority Actions**: Sorted by impact with estimated effort
- **Suggested Workflow**: Step-by-step improvement plan

```json
{
  "overallScore": 72,
  "grade": "C",
  "priorityActions": [
    { "action": "Add ESLint configuration", "priority": "high", "impact": "Improves code quality" },
    { "action": "Add tests directory", "priority": "medium", "impact": "Enables testing" }
  ],
  "suggestedWorkflow": [
    { "step": 1, "action": "Run `analyze action:generate configType:eslint`" },
    { "step": 2, "action": "Run `analyze action:generate configType:prettier`" }
  ]
}
```

### Enhanced Setup with Intelligence
Setup now includes quick intelligence analysis:

```json
{
  "intelligence": {
    "structureScore": 85,
    "configScore": 60,
    "dependencyScore": 90,
    "quickWins": ["Add .prettierrc for consistent formatting"]
  }
}
```

## Supported Stacks

`python-django` · `python-fastapi` · `python-flask` · `react-node` · `react-typescript` · `vue-node` · `nextjs` · `express` · `nestjs` · `laravel` · `rails` · `golang` · `rust`

## Examples

```bash
# Auto-setup with wizard
setup

# Generate React component
generate type:"component" name:"Dashboard"

# Review with Quick Fixes
review file:"src/App.tsx" focus:"performance"

# Check project health
health

# NEW: Analyze project intelligence
analyze action:"full"
analyze action:"generate" configType:"prettier"

# Browse and import community rules
cursor action:"popular"
cursor action:"import" slug:"typescript-best-practices"
```

## License

MIT
