/**
 * Help handler - provides help and documentation
 */

import { SUPPORTED_PROJECTS } from '../config/types.js';
import { ToolResponse, textResponse } from './types.js';

interface HelpArgs {
  topic?: 'setup' | 'rules' | 'review' | 'cursor' | 'docs' | 'config' | 'all';
}

const helpContent: Record<string, string> = {
  setup: `## setup
Configure StackGuide for your project.

**Auto-detect:** \`setup\` or \`setup path:"."\`
**Manual:** \`setup type:"react-typescript"\`

Available types: ${Object.keys(SUPPORTED_PROJECTS).join(', ')}`,

  rules: `## rules
Manage coding rules.

**List:** \`rules\` or \`rules action:"list"\`
**Search:** \`rules action:"search" query:"security"\`
**Get:** \`rules action:"get" query:"rule-id"\`
**Select:** \`rules action:"select" ids:["id1","id2"]\``,

  review: `## review
Review code against active rules.

**File:** \`review file:"src/index.ts"\`
**URL:** \`review url:"https://..."\`
**Project:** \`review project:true\`
**Focus:** \`review project:true focus:"security"\``,

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
**List:** \`config action:"list"\``
};

export async function handleHelp(args: HelpArgs): Promise<ToolResponse> {
  const { topic = 'all' } = args;

  if (topic === 'all') {
    return textResponse(`# StackGuide Help

## Quick Start
1. \`setup\` - Auto-configure for your project
2. \`context\` - See loaded rules
3. \`review file:"src/index.ts"\` - Review your code

## Available Tools
- **setup** - Configure project
- **context** - View current context  
- **rules** - Manage rules
- **knowledge** - Access knowledge base
- **review** - Code review
- **cursor** - Browse cursor.directory
- **docs** - Web documentation
- **config** - Save/load configurations
- **custom_rule** - Create custom rules

Use \`help topic:"setup"\` for details on a specific tool.`);
  }

  return textResponse(
    helpContent[topic] || `Unknown topic: ${topic}. Available: setup, rules, review, cursor, docs, config, all`
  );
}
