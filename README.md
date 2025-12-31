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

- *"Set up my project"* → Auto-configures everything
- *"Review my code"* → Analyzes against active rules
- *"Browse React rules"* → Shows community rules

## Tools (10 simplified)

| Tool | Description | Example |
|------|-------------|---------|
| `setup` | Configure project (auto or manual) | `setup` or `setup type:"react-typescript"` |
| `context` | View current configuration | `context` or `context full:true` |
| `rules` | List, search, get rules | `rules action:"search" query:"security"` |
| `knowledge` | Access patterns & solutions | `knowledge action:"get" query:"architecture"` |
| `review` | Review code against rules | `review file:"src/index.ts"` or `review project:true` |
| `cursor` | Browse cursor.directory | `cursor action:"browse" query:"react"` |
| `docs` | Fetch web documentation | `docs action:"fetch" url:"https://..."` |
| `config` | Save/load configurations | `config action:"save" name:"my-project"` |
| `custom_rule` | Create custom rules | `custom_rule action:"create" name:"..." content:"..."` |
| `help` | Get help | `help` or `help topic:"review"` |

## Supported Stacks

`python-django` · `python-fastapi` · `react-node` · `react-typescript` · `vue-node` · `nextjs` · `express` · `nestjs` · `laravel` · `rails` · `golang` · `rust`

## Examples

```bash
# Auto-setup (detects project type)
setup

# Review a file
review file:"src/components/App.tsx"

# Review entire project for security
review project:true focus:"security"

# Browse cursor.directory
cursor action:"browse" query:"typescript"

# Import a community rule
cursor action:"import" slug:"react-best-practices"
```

## License

MIT
