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

Just tell your AI assistant in natural language:

- *"Set up my project"* → Auto-detects and configures everything
- *"I'm working on a Django API"* → Configures Python/Django context
- *"Configure for React with TypeScript"* → Sets up React-TS rules
- *"Browse Python rules from cursor directory"* → Shows community rules

## Auto-Setup (NEW in 1.1.0!)

StackGuide can automatically detect your project type and configure itself:

```
auto_setup projectPath:"."
```

It analyzes your `package.json`, `requirements.txt`, `Cargo.toml`, etc. and loads the right rules.

## Supported Stacks

`python-django` · `python-fastapi` · `python-flask` · `react-node` · `react-typescript` · `vue-node` · `nextjs` · `express` · `nestjs` · `laravel` · `rails` · `golang` · `rust`

## Tools (46 total)

| Category | Tools |
|----------|-------|
| **Smart Setup** | `auto_setup` `detect_project` `suggest_rules` `quick_start` |
| **Project** | `list_project_types` `select_project_type` `get_current_context` |
| **Rules** | `list_rules` `get_rule` `select_rules` `search_rules` `create_rule` `update_rule` `delete_rule` |
| **Knowledge** | `list_knowledge` `get_knowledge` `select_knowledge` `search_knowledge` |
| **Config** | `save_configuration` `load_configuration` `list_configurations` `export_configuration` |
| **Web Docs** | `fetch_web_docs` `list_web_docs` `search_web_docs` `get_suggested_docs` |
| **Cursor Directory** | `browse_cursor_directory` `search_cursor_directory` `import_cursor_directory_rule` |
| **Context** | `get_full_context` `add_custom_rule` |

## How It Works

1. **Auto-detect**: Analyzes project files to identify your stack
2. **Load context**: Loads relevant rules, standards, and patterns
3. **Suggest**: Recommends community rules from cursor.directory
4. **Persist**: Saves your configuration for future sessions

## Cursor Directory Integration

Import community rules from [cursor.directory](https://cursor.directory/rules/):

```
browse_cursor_directory category:"python"
search_cursor_directory query:"react hooks"
import_cursor_directory_rule slug:"nextjs-react-typescript-cursor-rules"
```

## License

GPL-3.0
