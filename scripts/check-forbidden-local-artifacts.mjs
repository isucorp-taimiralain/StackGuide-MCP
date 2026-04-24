#!/usr/bin/env node

/**
 * Prevent accidental commits of local machine artifacts.
 * This intentionally blocks tracked files under .stackguide/.
 */

import { execFileSync } from 'node:child_process';

const FORBIDDEN_PREFIXES = ['.stackguide/', '.stackguide-local/'];

function listTrackedFiles() {
  try {
    const output = execFileSync('git', ['ls-files'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').map(line => line.trim()).filter(Boolean);
  } catch {
    // Not a git repository or git unavailable; skip guard in this context.
    return [];
  }
}

function main() {
  const trackedFiles = listTrackedFiles();
  const forbiddenFiles = trackedFiles.filter(file =>
    FORBIDDEN_PREFIXES.some(prefix => file.startsWith(prefix))
  );

  if (forbiddenFiles.length === 0) {
    return;
  }

  const details = forbiddenFiles.map(file => ` - ${file}`).join('\n');
  console.error('Forbidden tracked local artifacts detected:');
  console.error(details);
  console.error('\nThese files are machine-local and must never be versioned.');
  console.error('Run: git rm --cached <file> and keep .stackguide/ ignored.');
  process.exit(1);
}

main();
