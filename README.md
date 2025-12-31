# StackGuide MCP Server

Dynamic context loading for AI coding assistants. Works with **Cursor** and **GitHub Copilot**.

## Quick Start

### 1. Configure

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

**VS Code** (`.vscode/mcp.json`):
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

### 2. Use

Just ask your AI assistant:
- *"Select project type react-node"*
- *"List available rules"*
- *"Get full context"*
- *"Browse cursor directory for python rules"*

## Supported Stacks

`python-django` · `python-fastapi` · `python-flask` · `react-node` · `react-typescript` · `vue-node` · `nextjs` · `express` · `nestjs` · `laravel` · `rails` · `golang` · `rust`

## Tools (42 total)

| Category | Tools |
|----------|-------|
| **Project** | `list_project_types` `select_project_type` `get_current_context` |
| **Rules** | `list_rules` `get_rule` `select_rules` `search_rules` `create_rule` `update_rule` `delete_rule` |
| **Knowledge** | `list_knowledge` `get_knowledge` `select_knowledge` `search_knowledge` |
| **Config** | `save_configuration` `load_configuration` `list_configurations` `export_configuration` |
| **Web Docs** | `fetch_web_docs` `list_web_docs` `search_web_docs` `get_suggested_docs` |
| **Cursor Directory** | `browse_cursor_directory` `search_cursor_directory` `import_cursor_directory_rule` `get_popular_cursor_rules` |
| **Context** | `get_full_context` `add_custom_rule` |

## Cursor Directory Integration

Import community rules from [cursor.directory](https://cursor.directory/rules/):

```
browse_cursor_directory category:"python"
search_cursor_directory query:"react best practices"
import_cursor_directory_rule slug:"nextjs-react-typescript-cursor-rules"
```

## Custom Rules

Create your own rules that persist across sessions:

```
create_rule projectType:"react-node" name:"My Standards" category:"best-practices" content:"..."
```

Rules are stored in `~/.stackguide/rules/`.

## License

GPL-3.0
