import { DEFAULT_STAND_BUSINESS_TEMPLATES } from './default-template';

export type StandMembershipTemplateKey = keyof typeof DEFAULT_STAND_BUSINESS_TEMPLATES;
export type StandMembershipTemplates = Partial<Record<StandMembershipTemplateKey, string>>;

export type StandMembershipScriptAction = {
  action_type: string;
  member_name: string;
  priesthood_office?: string | null;
};

export function parseMembershipTemplateSegments(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('**') && segment.endsWith('**')) return { text: segment.slice(2, -2), bold: true };
      return { text: segment, bold: false };
    });
}

export function renderMembershipOrdinanceScript(
  action: StandMembershipScriptAction,
  templates: StandMembershipTemplates | null | undefined,
  labels: { assignedOffice: string; priesthoodOffice?: string | null }
): string | null {
  const templateActionType = action.action_type === 'BAPTISM_CONFIRMATION_FOLLOW_UP' ? 'WELCOME_NEW_MEMBER' : action.action_type;
  if (!Object.hasOwn(DEFAULT_STAND_BUSINESS_TEMPLATES, templateActionType)) return null;

  const key = templateActionType as StandMembershipTemplateKey;
  const configuredTemplate = templates?.[key];
  const template =
    typeof configuredTemplate === 'string' && configuredTemplate.trim() ? configuredTemplate.trim() : DEFAULT_STAND_BUSINESS_TEMPLATES[key];
  const office =
    action.action_type.startsWith('PRIESTHOOD_') && action.priesthood_office && action.priesthood_office !== 'UNKNOWN'
      ? labels.priesthoodOffice
      : null;
  const callingName = office || labels.assignedOffice;

  return template.replaceAll('{memberName}', action.member_name).replaceAll('{callingName}', callingName);
}
