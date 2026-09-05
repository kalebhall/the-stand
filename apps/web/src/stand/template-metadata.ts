export type TemplateClassification = 'HANDBOOK_REQUIRED_ELEMENTS' | 'HANDBOOK_EXAMPLE' | 'WARD_PROMPT';

export type StandTemplateMetadata = {
  classification: TemplateClassification;
  sourceLabel: string;
  sourceUrl: string | null;
};

export const STAND_TEMPLATE_METADATA: Record<string, StandTemplateMetadata> = {
  welcome: { classification: 'WARD_PROMPT', sourceLabel: 'Local ward prompt', sourceUrl: null },
  sustain: { classification: 'WARD_PROMPT', sourceLabel: 'Local ward prompt', sourceUrl: null },
  release: { classification: 'WARD_PROMPT', sourceLabel: 'Local ward prompt', sourceUrl: null },
  welcomeNewMember: { classification: 'WARD_PROMPT', sourceLabel: 'Local ward prompt', sourceUrl: null },
  babyBlessing: { classification: 'HANDBOOK_REQUIRED_ELEMENTS', sourceLabel: 'General Handbook 18', sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng' },
  priesthoodOrdination: { classification: 'HANDBOOK_REQUIRED_ELEMENTS', sourceLabel: 'General Handbook 18', sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng' },
  priesthoodAdvancement: { classification: 'HANDBOOK_REQUIRED_ELEMENTS', sourceLabel: 'General Handbook 18', sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng' }
};

export function templateClassificationLabel(classification: TemplateClassification): string {
  return classification === 'WARD_PROMPT' ? 'Editable ward prompt' : classification === 'HANDBOOK_EXAMPLE' ? 'Handbook example' : 'Handbook required elements';
}