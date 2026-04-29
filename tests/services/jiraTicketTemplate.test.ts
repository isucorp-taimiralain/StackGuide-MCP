import { describe, expect, it } from 'vitest';
import { buildStrictMainDescriptionTemplate, deriveSummaryFromMainDescription } from '../../src/services/jiraTicketTemplate.js';

describe('jiraTicketTemplate', () => {
  it('builds strict template with required sections', () => {
    const content = buildStrictMainDescriptionTemplate({
      mainDescription: 'This feature constitutes the application layout.',
      destinationView: 'inexsupport-new/resources/frontend/profile.blade.php',
      prototypeRelatedFiles: [
        'inexsupport-new/prototypes/src/App.tsx',
        'inexsupport-new/prototypes/src/main.tsx',
      ],
      acceptanceCriteria: [
        'Layout must match the prototype exactly.',
        'My Account opens Breeze profile view.',
      ],
    });

    expect(content).toContain('MAIN DESCRIPTION');
    expect(content).toContain('ORIGIN (LEGACY)');
    expect(content).toContain('DESTINATION (LARAVEL 13)');
    expect(content).toContain('DATA TRANSFORMATION');
    expect(content).toContain('PROTOTYPES');
    expect(content).toContain('ACCEPTANCE CRITERIA');
  });

  it('derives summary from first non-empty line', () => {
    const summary = deriveSummaryFromMainDescription('\n\nImplement profile menu mapping\nextra context line');
    expect(summary).toBe('Implement profile menu mapping');
  });
});
