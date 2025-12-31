/**
 * Help handler - provides help and documentation
 */

import { SUPPORTED_PROJECTS } from '../config/types.js';
import { ToolResponse, textResponse } from './types.js';

interface HelpArgs {
  topic?: 'setup' | 'rules' | 'review' | 'cursor' | 'docs' | 'config' | 'generate' | 'health' | 'all';
}

const helpContent: Record<string, string> = {
  setup: `## setup
Configure StackGuide for your project with interactive wizard.

**Auto-detect:** \`setup\` or \`setup path:"."\`
**Manual:** \`setup type:"react-typescript"\`

The wizard will provide:
- Recommended tools and VS Code extensions
- Tips specific to your project type
- Next steps for optimal setup

Available types: ${Object.keys(SUPPORTED_PROJECTS).join(', ')}`,

  rules: `## rules
Manage coding rules.

**List:** \`rules\` or \`rules action:"list"\`
**Search:** \`rules action:"search" query:"security"\`
**Get:** \`rules action:"get" query:"rule-id"\`
**Select:** \`rules action:"select" ids:["id1","id2"]\``,

  review: `## review
Review code against active rules with Quick Fix suggestions.

**File:** \`review file:"src/index.ts"\`
**URL:** \`review url:"https://..."\`
**Project:** \`review project:true\`
**Focus:** \`review project:true focus:"security"\`

Now includes:
- 🔧 Quick Fix suggestions with code replacements
- Score (0-100) for code quality
- Categorized issues by severity`,

  cursor: `## cursor
Browse cursor.directory community rules.

**Categories:** \`cursor\` or \`cursor action:"categories"\`
**Popular:** \`cursor action:"popular"\`
**Browse:** \`cursor action:"browse" query:"react"\`
**Search:** \`cursor action:"search" query:"typescript"\`
**Import:** \`cursor action:"import" slug:"rule-slug"\``,

  docs: `## docs
Fetch and manage web documentation.

**Fetch:** \`docs action:"fetch" url:"https://..."\`
**List:** \`docs action:"list"\`
**Search:** \`docs action:"search" query:"hooks"\``,

  config: `## config
Save and load configurations.

**Save:** \`config action:"save" name:"my-config"\`
**Load:** \`config action:"load" id:"config-id"\`
**List:** \`config action:"list"\``,

  generate: `## generate
Generate boilerplate code from templates.

**Component:** \`generate type:"component" name:"UserCard"\`
**Hook:** \`generate type:"hook" name:"useAuth"\`
**Service:** \`generate type:"service" name:"ApiService"\`
**Test:** \`generate type:"test" name:"UserCard"\`
**API:** \`generate type:"api" name:"Users"\`
**Model:** \`generate type:"model" name:"User"\`
**Utility:** \`generate type:"util" name:"Format"\`

**Options:**
- typescript: true/false (auto-detected)
- withTests: include test file
- withStyles: include CSS module (components)
- framework: "nextjs", "express", "vitest", "jest"`,

  health: `## health
Get project health score and recommendations.

**Basic:** \`health\`
**Detailed:** \`health detailed:true\`

Returns:
- Overall score (0-100) with grade (A-F)
- Category breakdown:
  - Configuration
  - Code Quality
  - Project Structure
  - Documentation
  - Testing Readiness
- Critical issues
- Top recommendations`
};

export async function handleHelp(args: HelpArgs): Promise<ToolResponse> {
  const { topic = 'all' } = args;

  if (topic === 'all') {
    return textResponse(`# StackGuide Help

## Quick Start
1. \`setup\` - Auto-configure for your project (with wizard)
2. \`context\` - See loaded rules
3. \`review file:"src/index.ts"\` - Review your code
4. \`health\` - Check project health

## Available Tools (12)

### Core Tools
- **setup** - Configure project with interactive wizard
- **context** - View current context  
- **rules** - Manage coding rules
- **knowledge** - Access knowledge base
- **review** - Code review with Quick Fixes

### Advanced Features
- **generate** - Generate boilerplate code (NEW!)
- **health** - Project health score (NEW!)

### Integration Tools
- **cursor** - Browse cursor.directory
- **docs** - Web documentation
- **config** - Save/load configurations
- **custom_rule** - Create custom rules
- **help** - This help content

## Examples
\`\`\`
setup type:"react-typescript"
generate type:"component" name:"UserCard"
review file:"src/App.tsx" focus:"performance"
health detailed:true
\`\`\`

Use \`help topic:"setup"\` for details on a specific tool.`);
  }

  return textResponse(
    helpContent[topic] || `Unknown topic: ${topic}. Available: setup, rules, review, cursor, docs, config, generate, health, all`
  );
}
