export const TEMPLATE_CLASSIFICATIONS = {
  welcomeText: {
    label: 'Ward prompt',
    description: 'Local welcome text; no fixed Handbook wording is prescribed.',
    sourceLabel: 'General Handbook 29.2.1.1',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng#title_number59'
  },
  sustainTemplate: {
    label: 'Sample sustaining wording',
    description: 'Editable sample wording; verify current guidance before use.',
    sourceLabel: 'General Handbook 18.10.3',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng#title_number64'
  },
  releaseTemplate: {
    label: 'Ward prompt',
    description: 'Local release prompt; use only with authorized calling action.',
    sourceLabel: 'General Handbook 29.2.1.1',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng#title_number59'
  },
  welcomeNewMemberTemplate: {
    label: 'Ward prompt',
    description: 'Editable meeting prompt; not official record or ordinance text.',
    sourceLabel: 'General Handbook 29.2.1.1',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng#title_number59'
  },
  recognizeBaptizedChildTemplate: {
    label: 'Ward prompt',
    description: 'Editable recognition prompt; does not replace baptism or confirmation.',
    sourceLabel: 'General Handbook 29.2.1.1',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/29-meetings-in-the-church?lang=eng#title_number59'
  },
  babyBlessingTemplate: {
    label: 'Handbook instruction',
    description: 'Use required elements; this is not a fixed ordinance script.',
    sourceLabel: 'General Handbook 18.6.2',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng#title_number10'
  },
  priesthoodOrdinationTemplate: {
    label: 'Sample sustaining wording',
    description: 'Editable presentation prompt; ordinance completion remains separate.',
    sourceLabel: 'General Handbook 18.10.3 and 18.10.5',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng#title_number64'
  },
  priesthoodAdvancementTemplate: {
    label: 'Sample sustaining wording',
    description: 'Editable presentation prompt; ordinance completion remains separate.',
    sourceLabel: 'General Handbook 18.10.3 and 18.10.5',
    sourceUrl: 'https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng#title_number64'
  }
} as const;

export type TemplateClassificationKey = keyof typeof TEMPLATE_CLASSIFICATIONS;
