# StackGuide MCP Server

Dynamic context loading for AI coding assistants. Works with **Cursor** and **GitHub Copilot**.

[![Version](https://img.shields.io/badge/version-3.7.0-blue.svg)](https://github.com/stackguide/mcp-server)
[![Tests](https://img.shields.io/badge/tests-659%20passing-green.svg)](./tests)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## 🚀 Quick Start

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

## 💬 Usage

Just talk naturally:

- *"Set up my project"* → Auto-configures with interactive wizard
- *"Review my code"* → Analyzes with AST-powered Quick Fixes
- *"Generate a component"* → Creates boilerplate code
- *"Check project health"* → Returns health score (A-F)
- *"Analyze my project"* → Auto-configuration intelligence
- *"Browse React rules"* → Shows community rules
- *"Configure rules"* → **NEW!** Customize analysis rules

## 🛠️ Tools (13 total)

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

## 🆕 New in v3.7.0: Configurable Rules Engine

### Custom Rules CRUD
Create, update, delete, and manage custom rules with full persistence:

```bash
# Create custom rule
rules action:"create" rule:{"id":"MY-001", "name":"Custom Rule", "description":"...", "severity":"warning", "pattern":"console\\.log"}

# Update rule
rules action:"update" ruleId:"MY-001" updates:{"severity":"error"}

# Delete rule
rules action:"delete" ruleId:"MY-001"

# List all rules (builtin + custom)
rules action:"list" category:"security"

# Import/Export rules
rules action:"export" format:"json"
rules action:"import" rules:[...]
```

### Rule Overrides
Override builtin rule behavior without modifying them:

```bash
# Disable a rule
rules action:"override" ruleId:"TS-SEC001" override:{"enabled":false}

# Change severity
rules action:"override" ruleId:"TS-PERF002" override:{"severity":"error"}

# Custom message
rules action:"override" ruleId:"TS-BP001" override:{"customMessage":"Use arrow functions in this project"}

# File-specific overrides
rules action:"override" ruleId:"TS-SEC002" override:{"filePatterns":["!**/tests/**"]}

# Remove override
rules action:"clearOverride" ruleId:"TS-SEC001"
```

### Rule Settings
Configure global rule behavior:

```bash
# Get current settings
rules action:"settings"

# Update settings
rules action:"updateSettings" settings:{"enableBuiltin":true, "enableCustom":true, "defaultSeverity":"warning"}
```

---

## 🆕 New in v3.6.0: Input Validation (Zod)

All tool inputs are now validated with Zod schemas:

- **Type-safe inputs**: All parameters are validated against schemas
- **Helpful error messages**: Clear validation errors with path information
- **Path sanitization**: Prevents path traversal attacks
- **Automatic sanitization**: Sensitive data is masked in logs

```typescript
// Example validation error
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    { "path": ["file"], "message": "Required" },
    { "path": ["focus"], "message": "Invalid enum value. Expected 'security' | 'performance' | 'best-practices'" }
  ]
}
```

---

## 🆕 New in v3.5.0: AST-Powered Analysis (Tree-sitter)

### Real Semantic Code Analysis
Code review now uses tree-sitter for accurate AST-based analysis:

```bash
review file:"src/index.ts" focus:"security"
```

**Supported Languages**: TypeScript, JavaScript, Python, Go, Rust

**Analysis Categories**:
- 🔒 **Security**: eval detection, SQL injection, XSS, hardcoded secrets
- ⚡ **Performance**: nested loops, inefficient operations
- ✨ **Best Practices**: any usage, console.log in production, unused vars
- 🏗️ **Maintainability**: function complexity, file length

**Code Metrics**:
```json
{
  "metrics": {
    "linesOfCode": 150,
    "functions": 12,
    "classes": 3,
    "imports": 8,
    "exports": 5,
    "complexity": 24,
    "maxNesting": 4
  }
}
```

---

## 🆕 New in v3.4.0: Architecture Improvements

### SQLite Persistence
All configuration now persists across sessions:

```bash
config action:"save" name:"my-project"
config action:"load" name:"my-project"
config action:"list"
config action:"delete" name:"my-project"
```

### Real Filesystem Access
Analyze actual project files:

```bash
analyze action:"full" path:"./src"
health detailed:true
```

### HTTP Client with Caching
Rate-limited API calls with automatic caching:

```bash
docs action:"fetch" url:"https://react.dev/reference/react"
cursor action:"browse" query:"nextjs"
```

---

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

## 📋 Supported Stacks

`python-django` · `python-fastapi` · `python-flask` · `react-node` · `react-typescript` · `vue-node` · `nextjs` · `express` · `nestjs` · `laravel` · `rails` · `golang` · `rust`

## 📖 Examples

```bash
# Auto-setup with wizard
setup

# Generate React component
generate type:"component" name:"Dashboard"

# Review with AST-powered Quick Fixes
review file:"src/App.tsx" focus:"performance"

# Check project health
health

# Analyze project intelligence
analyze action:"full"
analyze action:"generate" configType:"prettier"

# Browse and import community rules
cursor action:"popular"
cursor action:"import" slug:"typescript-best-practices"

# Configure rules
rules action:"list" category:"security"
rules action:"create" rule:{"id":"MY-001", "name":"No TODO", "pattern":"TODO", "severity":"info"}
rules action:"override" ruleId:"TS-SEC001" override:{"severity":"error"}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                            │
├─────────────────────────────────────────────────────────┤
│  Router (handler registration + validation)              │
├─────────────────────────────────────────────────────────┤
│  Handlers (setup, review, generate, health, etc.)        │
├─────────────────────────────────────────────────────────┤
│  Services Layer                                          │
│  ├── AST Analysis (tree-sitter multi-language)          │
│  ├── Rules Engine (builtin + custom + overrides)        │
│  ├── Code Analyzer (semantic analysis)                  │
│  ├── Rule Manager (data loading)                        │
│  └── Auto Detect (project type detection)               │
├─────────────────────────────────────────────────────────┤
│  Infrastructure                                          │
│  ├── Validation (Zod schemas)                           │
│  ├── Persistence (SQLite storage)                       │
│  ├── ProjectFs (filesystem abstraction)                 │
│  └── HttpClient (rate-limited + cached)                 │
└─────────────────────────────────────────────────────────┘
```

## 🧪 Testing

```bash
# Run all tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Test Statistics**: 659 tests across 35 test files

## 📚 API Reference

### Tool Parameters

#### `setup`
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Project type (optional, auto-detected) |
| `path` | string | Project path (default: current dir) |

#### `review`
| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | string | **Required**. File path to review |
| `content` | string | File content (optional, read from file) |
| `focus` | string | `security` \| `performance` \| `best-practices` |
| `detailed` | boolean | Include code metrics |

#### `generate`
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | **Required**. `component` \| `hook` \| `service` \| `test` \| `api` \| `model` \| `util` |
| `name` | string | **Required**. Name for generated code |
| `options` | object | Framework-specific options |

#### `rules`
| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | **Required**. `list` \| `search` \| `get` \| `create` \| `update` \| `delete` \| `override` \| `clearOverride` \| `settings` \| `import` \| `export` |
| `ruleId` | string | Rule ID (for get/update/delete/override) |
| `rule` | object | Rule definition (for create) |
| `override` | object | Override settings |
| `category` | string | Filter by category |

#### `health`
| Parameter | Type | Description |
|-----------|------|-------------|
| `detailed` | boolean | Include category breakdown |
| `path` | string | Project path |

#### `analyze`
| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | **Required**. `full` \| `structure` \| `config` \| `dependencies` \| `generate` \| `apply` |
| `path` | string | Project path |
| `configType` | string | For generate: `eslint` \| `prettier` \| `tsconfig` |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing`)
6. Open a Pull Request

## 📄 License

MIT
