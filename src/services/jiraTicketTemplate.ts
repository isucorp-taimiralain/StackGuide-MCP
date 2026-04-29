export interface JiraTicketTemplateInput {
  mainDescription: string;
  originComponent?: string;
  originKeyLogic?: string;
  originOldQuery?: string;
  destinationModel?: string;
  destinationController?: string;
  destinationRoute?: string;
  destinationView?: string;
  dataTransformation?: string;
  prototypeDesignPattern?: string;
  prototypeView?: string;
  prototypeProps?: string;
  prototypeRelatedFiles?: string[];
  acceptanceCriteria?: string[];
}

function normalizeField(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '-';
}

function normalizeLines(values?: string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return values
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

export function deriveSummaryFromMainDescription(mainDescription: string, maxLength = 120): string {
  const firstLine = mainDescription
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0);

  const normalized = firstLine || 'Untitled Task';
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function buildStrictMainDescriptionTemplate(input: JiraTicketTemplateInput): string {
  const relatedFiles = normalizeLines(input.prototypeRelatedFiles);
  const acceptanceCriteria = normalizeLines(input.acceptanceCriteria);
  const transformationText = input.dataTransformation?.trim()
    || 'This functionality does not include data transformation.';

  const sections: string[] = [
    'MAIN DESCRIPTION',
    '',
    input.mainDescription.trim(),
    '',
    'ORIGIN (LEGACY)',
    '',
    `Component: ${normalizeField(input.originComponent)}`,
    '',
    `Key Logic: ${normalizeField(input.originKeyLogic)}`,
    '',
    `Old Query: ${normalizeField(input.originOldQuery)}`,
    '',
    'DESTINATION (LARAVEL 13)',
    '',
    `Model: ${normalizeField(input.destinationModel)}`,
    '',
    `Controller: ${normalizeField(input.destinationController)}`,
    '',
    `Route: ${normalizeField(input.destinationRoute)}`,
    '',
    `View: ${normalizeField(input.destinationView)}`,
    '',
    'DATA TRANSFORMATION',
    '',
    transformationText,
    '',
    'PROTOTYPES',
    '',
    `Design Pattern: ${normalizeField(input.prototypeDesignPattern)}`,
    '',
    `View: ${normalizeField(input.prototypeView)}`,
    '',
    `Props: ${normalizeField(input.prototypeProps)}`,
    'Related files:',
  ];

  if (relatedFiles.length === 0) {
    sections.push('-');
  } else {
    sections.push(...relatedFiles.map(filePath => `- ${filePath}`));
  }

  sections.push('', 'ACCEPTANCE CRITERIA', '');
  if (acceptanceCriteria.length === 0) {
    sections.push('-');
  } else {
    sections.push(...acceptanceCriteria.map(criteria => `- ${criteria}`));
  }

  return sections.join('\n');
}
