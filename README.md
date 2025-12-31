# StackGuide MCP Server

A Model Context Protocol (MCP) server that provides dynamic language and framework context for AI coding assistants. Compatible with **Cursor** and **GitHub Copilot**.

## Features

- 🎯 **Dynamic Context Loading**: Load context based on your project type (Python/Django, React/Node, etc.)
- 📋 **Rules Management**: Select and apply coding standards, best practices, and security guidelines
- 📚 **Knowledge Base**: Access architecture patterns, common issues solutions, and code snippets
- 💾 **Configuration Persistence**: Save and load your preferred configurations
- 🔄 **Compatible**: Works with both Cursor and GitHub Copilot
- ✨ **Dynamic Rule Management**: Create, edit, and delete rules at runtime using tools
- 🌐 **Web Documentation**: Fetch and cache documentation from any URL
- 📝 **Rule Templates**: Quick-start templates for common rule types (coding-standard, best-practice, security, architecture, testing)
- 🔗 **Cursor Directory Integration**: Browse, search, and import rules from [cursor.directory](https://cursor.directory/rules/) - a community-driven repository of AI coding rules

## Supported Project Types

| Type | Languages | Frameworks |
|------|-----------|------------|
| `python-django` | Python | Django, DRF |
| `python-fastapi` | Python | FastAPI |
| `python-flask` | Python | Flask |
| `react-node` | JavaScript, TypeScript | React, Node.js, Express |
| `react-typescript` | TypeScript | React |
| `vue-node` | JavaScript, TypeScript | Vue.js, Node.js |
| `nextjs` | JavaScript, TypeScript | Next.js, React |
| `express` | JavaScript, TypeScript | Express.js |
| `nestjs` | TypeScript | NestJS |
| `laravel` | PHP | Laravel |
| `rails` | Ruby | Ruby on Rails |
| `golang` | Go | - |
| `rust` | Rust | - |

## Installation

### From npm (Recommended)

```bash
npm install -g @stackguide/mcp-server
```

### From Source

```bash
git clone https://github.com/taimiralain/StackGuide-MCP.git
cd StackGuide-MCP
npm install
npm run build
```

## Configuration

### For Cursor

Add to your Cursor settings (`.cursor/mcp.json`):

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

Or if installed from source:

```json
{
  "mcpServers": {
    "stackguide": {
      "command": "node",
      "args": ["/path/to/StackGuide-MCP/dist/index.js"]
    }
  }
}
```

### For VS Code with GitHub Copilot

Add to `.vscode/mcp.json` in your workspace:

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

Or add to your user settings (`settings.json`):

```json
{
  "github.copilot.chat.mcpServers": {
    "stackguide": {
      "command": "npx",
      "args": ["-y", "@stackguide/mcp-server"]
    }
  }
}
```

## Usage

### Available Tools

#### Project Type Management
- `list_project_types` - List all supported project types
- `select_project_type` - Activate a project type context
- `get_current_context` - Get the currently active context

#### Rules Management
- `list_rules` - List available rules for current project
- `get_rule` - Get full content of a specific rule
- `select_rules` - Select which rules to include in context
- `search_rules` - Search rules by keyword

#### Knowledge Base
- `list_knowledge` - List knowledge base files
- `get_knowledge` - Get content of a knowledge file
- `select_knowledge` - Select knowledge to include
- `search_knowledge` - Search knowledge base

#### Configuration
- `save_configuration` - Save current context setup
- `load_configuration` - Load a saved configuration
- `list_configurations` - List all saved configurations
- `delete_configuration` - Delete a configuration
- `export_configuration` - Export config as JSON
- `import_configuration` - Import config from JSON

#### Dynamic Rule Management (NEW!)
- `create_rule` - Create a new custom rule from scratch
- `create_rule_from_template` - Create a rule using a template
- `list_rule_templates` - List available rule templates
- `update_rule` - Update an existing user rule
- `delete_rule` - Delete a user rule
- `list_user_rules` - List all user-created rules
- `export_user_rules` - Export all user rules as JSON
- `import_user_rules` - Import user rules from JSON

#### Web Documentation (NEW!)
- `fetch_web_docs` - Fetch documentation from any URL
- `fetch_multiple_docs` - Fetch multiple URLs at once
- `get_web_doc` - Get a cached web document
- `search_web_docs` - Search cached documentation
- `list_web_docs` - List all cached documents
- `get_suggested_docs` - Get suggested docs for a project type
- `remove_web_doc` - Remove a cached document

#### Cursor Directory Integration (NEW!)
- `browse_cursor_directory` - Browse rules by category from cursor.directory
- `search_cursor_directory` - Search for rules on cursor.directory
- `get_cursor_directory_rule` - Get a specific rule by slug
- `list_cursor_directory_categories` - List all available categories
- `get_popular_cursor_rules` - Get popular/featured rules
- `import_cursor_directory_rule` - Import a rule into your local collection

#### Context
- `get_full_context` - Get complete active context
- `add_custom_rule` - Add a custom rule

### Example Workflow

1. **Select your project type:**
   ```
   Use select_project_type with "react-node"
   ```

2. **View available rules:**
   ```
   Use list_rules to see all available rules
   ```

3. **Select specific rules:**
   ```
   Use select_rules with the IDs of rules you want
   ```

4. **Save your configuration:**
   ```
   Use save_configuration with a name like "My React Setup"
   ```

5. **Get full context for AI:**
   ```
   Use get_full_context to get all selected rules and knowledge
   ```

### Available Resources

- `rules://{project_type}/all` - All rules for a project type
- `knowledge://{project_type}/all` - All knowledge for a project type
- `context://active` - Currently active context (includes rules, user rules, knowledge, and web docs)
- `user-rules://{project_type}/all` - All user-created rules for a project type
- `web-doc://{doc_id}` - Specific cached web document
- `templates://rules` - Available rule templates

### Available Prompts

- `setup_project` - Initialize context for a new project
- `code_review` - Review code with active rules
- `apply_patterns` - Apply architecture patterns

## Adding Custom Rules

### Via Tool
Use the `add_custom_rule` tool with:
- `name`: Rule name
- `category`: One of `coding-standards`, `best-practices`, `security`, `performance`, `architecture`, `testing`, `documentation`, `naming-conventions`
- `content`: Rule content in Markdown
- `description`: Brief description

### Via Files
Add Markdown files to the `data/rules/{project-type}/{category}/` directory:

```markdown
# Rule Title

Description of the rule.

## Guidelines

- Guideline 1
- Guideline 2

## Examples

```python
# Code example
```
```

## Configuration Storage

User configurations are stored in `~/.stackguide/`:
- `configurations.json` - All saved configurations
- `rules/{project-type}/*.json` - User-created rules
- `web-docs/cache.json` - Cached web documentation

## Development

### Build

```bash
npm run build
```

### Run in Development

```bash
npm run dev
```

### Project Structure

```
StackGuide-MCP/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/
│   │   ├── types.ts          # TypeScript types
│   │   └── persistence.ts    # Configuration storage
│   ├── resources/
│   │   ├── rulesProvider.ts      # Rules management
│   │   └── knowledgeProvider.ts  # Knowledge base
│   └── services/
│       ├── ruleManager.ts        # Dynamic rule CRUD
│       └── webDocumentation.ts   # Web docs fetcher
├── data/
│   ├── rules/                # Rule files by project type
│   │   ├── python-django/
│   │   └── react-node/
│   └── knowledge/            # Knowledge files by project type
│       ├── python-django/
│       └── react-node/
├── docs/
│   └── ADDING_CUSTOM_RULES.md   # Guide for adding rules
├── package.json
├── tsconfig.json
└── README.md
```

## Dynamic Rule Management

### Creating Rules from Templates

1. **List available templates:**
   ```
   Use list_rule_templates
   ```

2. **Create a rule from template:**
   ```
   Use create_rule_from_template with:
   - templateId: "coding-standard" 
   - projectType: "react-node"
   - name: "My Team Standards"
   ```

3. **Edit the rule:**
   ```
   Use update_rule with the rule ID and new content
   ```

### Creating Rules from Scratch

```
Use create_rule with:
- projectType: "python-django"
- name: "API Versioning"
- category: "best-practices"
- content: "# API Versioning\n\nAlways version your APIs..."
- description: "Guidelines for API versioning"
```

## Web Documentation

### Fetching Documentation

```
Use fetch_web_docs with:
- url: "https://react.dev/reference/react/useState"
- projectType: "react-node"  
- title: "useState Hook"
```

### Getting Suggestions

```
Use get_suggested_docs with projectType: "react-node"
```

This returns popular documentation URLs for the framework.

## Cursor Directory Integration

[cursor.directory](https://cursor.directory/rules/) is a community-driven repository of cursor rules for various technologies. StackGuide-MCP integrates with it to let you:

### Browse Rules by Category

```
Use browse_cursor_directory with category: "typescript"
```

Available categories include: typescript, python, react, next.js, vue, django, fastapi, nestjs, prisma, tailwindcss, and many more.

### Search for Rules

```
Use search_cursor_directory with query: "react hooks best practices"
```

### Get Popular Rules

```
Use get_popular_cursor_rules
```

Returns featured rules from popular frameworks.

### Import Rules

```
Use import_cursor_directory_rule with:
- slug: "nextjs-react-typescript-cursor-rules"
- projectType: "react-typescript"
- category: "best-practices"
```

This fetches the rule from cursor.directory and saves it to your local rules collection.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your rules/knowledge files or enhance the server
4. Submit a pull request

### Adding Support for New Frameworks

1. Add project type to `src/config/types.ts`
2. Create rule files in `data/rules/{new-type}/`
3. Create knowledge files in `data/knowledge/{new-type}/`

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
