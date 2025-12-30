# Guide for Adding Custom Rules and Coding Standards

This guide will help you add your own rules, coding standards, and knowledge files to StackGuide MCP.

## 📁 File Structure

```
data/
├── rules/                          # Rules and standards
│   ├── python-django/              # By project type
│   │   ├── coding-standards/       # Code standards
│   │   ├── best-practices/         # Best practices
│   │   ├── security/               # Security
│   │   ├── performance/            # Performance
│   │   ├── architecture/           # Architecture
│   │   ├── testing/                # Testing
│   │   ├── documentation/          # Documentation
│   │   └── naming-conventions/     # Naming conventions
│   └── react-node/
│       └── ...
└── knowledge/                      # Knowledge base
    ├── python-django/
    │   ├── patterns/               # Design patterns
    │   ├── common-issues/          # Common issues
    │   ├── architecture/           # Architecture
    │   ├── snippets/               # Code snippets
    │   ├── workflows/              # Workflows
    │   └── troubleshooting/        # Troubleshooting
    └── react-node/
        └── ...
```

## 🆕 Adding New Rules

### Step 1: Choose the Location

Navigate to the corresponding folder:
- `data/rules/{project-type}/{category}/`

**Available project types:**
- `python-django`
- `python-fastapi`
- `python-flask`
- `react-node`
- `react-typescript`
- `vue-node`
- `nextjs`
- `express`
- `nestjs`
- `laravel`
- `rails`
- `golang`
- `rust`
- `custom` (for custom projects)

**Rule categories:**
- `coding-standards` - Code standards
- `best-practices` - Best practices
- `security` - Security
- `performance` - Performance
- `architecture` - Architecture
- `testing` - Testing
- `documentation` - Documentation
- `naming-conventions` - Naming conventions

### Step 2: Create the Markdown File

Create a `.md` file with the following format:

```markdown
# Rule Title

Brief description of what this rule is about and why it's important.

## Guidelines

### Subtopic 1

Detailed explanation...

```code
// Code example
```

### Subtopic 2

More explanations...

## Examples

### ✅ Correct

```code
// Correct code example
```

### ❌ Incorrect

```code
// Incorrect code example
```

## References

- [Link to official documentation](https://...)
- [Other resources](https://...)
```

### Step 3: Practical Example

Create a naming conventions rule for React:

**File:** `data/rules/react-node/naming-conventions/component-naming.md`

```markdown
# Naming Conventions for React Components

Guide for naming components, hooks, and files in React projects.

## Components

### Component Names

- Use **PascalCase** for component names
- The name should be descriptive and represent its function

```tsx
// ✅ Correct
function UserProfileCard() { ... }
function NavigationMenu() { ... }
function PaymentForm() { ... }

// ❌ Incorrect
function userProfileCard() { ... }  // camelCase
function User_Profile_Card() { ... } // snake_case
function UPC() { ... }               // Unclear abbreviation
```

### Component Files

- File name = Component name
- Use `.tsx` extension for TypeScript, `.jsx` for JavaScript

```
✅ Correct:
  UserProfileCard.tsx
  NavigationMenu.tsx

❌ Incorrect:
  user-profile-card.tsx
  userProfileCard.tsx
```

## Hooks

### Custom Hook Names

- Start with `use` prefix
- Use camelCase after the prefix

```tsx
// ✅ Correct
function useUserProfile() { ... }
function useLocalStorage() { ... }
function useDebounce() { ... }

// ❌ Incorrect
function UserProfile() { ... }      // Missing 'use' prefix
function useuser_profile() { ... }  // snake_case
```
```

## 📚 Adding Knowledge Files

### Knowledge Categories

- `patterns` - Design patterns and solutions
- `common-issues` - Common issues and their solutions
- `architecture` - Architecture guides
- `snippets` - Reusable code snippets
- `workflows` - Workflows and processes
- `troubleshooting` - Problem-solving guides

### Example Knowledge File

**File:** `data/knowledge/react-node/patterns/state-management.md`

```markdown
# State Management Patterns in React

Guide to different patterns for managing state in React applications.

## Local State

For component-specific state that doesn't need to be shared.

```tsx
const [count, setCount] = useState(0);
```

## Context API

For moderate state sharing across the component tree.

```tsx
const UserContext = createContext<User | null>(null);

function UserProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  return (
    <UserContext.Provider value={user}>
      {children}
    </UserContext.Provider>
  );
}
```

## When to Use Each Pattern

| Pattern | Use Case |
|---------|----------|
| useState | Simple component state |
| useReducer | Complex state logic |
| Context | Shared state without prop drilling |
| Redux/Zustand | Large scale global state |
```

## 🔧 Dynamic Rule Management

You can create, edit, and delete rules dynamically using MCP tools without restarting the server.

### Creating Rules via Tools

#### Using Templates

```
Tool: create_rule_from_template
Parameters:
  - templateId: "coding-standard" | "best-practice" | "security" | "architecture" | "testing"
  - projectType: "react-node"
  - name: "My Custom Standard"
  - description: "Description of the standard"
  - language: "typescript"
```

#### Creating from Scratch

```
Tool: create_rule
Parameters:
  - projectType: "python-django"
  - name: "API Versioning Guidelines"
  - category: "best-practices"
  - content: "# API Versioning\n\nAlways version your APIs..."
  - description: "Guidelines for API versioning"
```

### Managing Rules

```
Tool: list_user_rules
Parameters:
  - projectType: "react-node"

Tool: update_rule
Parameters:
  - ruleId: "user-react-node-best-practices-my-rule"
  - content: "Updated content..."

Tool: delete_rule
Parameters:
  - ruleId: "user-react-node-best-practices-my-rule"
```

### Export/Import

```
Tool: export_user_rules
# Returns JSON with all user-created rules

Tool: import_user_rules
Parameters:
  - jsonData: '{"react-node": [...]}'
```

## 🌐 Web Documentation

Fetch documentation from any URL and include it in your context.

### Fetching Documentation

```
Tool: fetch_web_docs
Parameters:
  - url: "https://react.dev/reference/react/useState"
  - projectType: "react-node"
  - title: "useState Hook"

Tool: fetch_multiple_docs
Parameters:
  - urls: ["https://url1.com", "https://url2.com"]
  - projectType: "react-node"
```

### Searching Documentation

```
Tool: search_web_docs
Parameters:
  - query: "useState"

Tool: get_suggested_docs
Parameters:
  - projectType: "react-node"
```

## 🏗️ Adding a New Project Type

If you need to support a new framework or technology:

### Step 1: Add Type Definition

Edit `src/config/types.ts`:

```typescript
export type ProjectType = 
  | 'python-django'
  | 'react-node'
  | 'my-new-type'  // Add here
  // ...
```

### Step 2: Add Project Information

```typescript
export const SUPPORTED_PROJECTS: Record<ProjectType, ProjectInfo> = {
  // ...
  'my-new-type': {
    type: 'my-new-type',
    name: 'My New Framework',
    description: 'Description of the framework',
    languages: ['javascript', 'typescript'],
    frameworks: ['my-framework'],
    detectionFiles: ['my-config.json']
  }
};
```

### Step 3: Create Directory Structure

```bash
mkdir -p data/rules/my-new-type/{coding-standards,best-practices,security}
mkdir -p data/knowledge/my-new-type/{patterns,common-issues}
```

### Step 4: Add Rules and Knowledge

Create your `.md` files in the appropriate directories.

### Step 5: Rebuild

```bash
npm run build
```

## 📝 Best Practices for Writing Rules

1. **Be Specific**: Provide concrete examples, not just guidelines
2. **Show Both Sides**: Include both correct and incorrect examples
3. **Explain Why**: Don't just say what to do, explain why
4. **Keep Updated**: Regularly review and update rules
5. **Use Code Examples**: Real code is better than abstract descriptions
6. **Add References**: Link to official documentation when relevant

## 🔄 Reloading Rules

After adding new rules to the `data/` directory:

1. Restart the MCP server, OR
2. Use the `clear_cache` functionality if available

For dynamically created rules (via tools), no restart is needed.

## 📊 Rule Priority

Rules have a priority field (0-100). Higher priority rules are loaded first:

- Built-in rules: 50 (default)
- User rules: 100 (high priority)

You can adjust priority in the rule file frontmatter:

```markdown
---
priority: 75
---

# My Rule Title

Content...
```
