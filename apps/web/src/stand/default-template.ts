export const DEFAULT_STAND_WELCOME_TEXT = 'Welcome to The Church of Jesus Christ of Latter-day Saints.';

export const DEFAULT_STAND_SUSTAIN_TEMPLATE =
  '**{memberName}** has been called as **{callingName}**. Those in favor of sustaining [him or her] may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]';

export const DEFAULT_STAND_RELEASE_TEMPLATE =
  '**{memberName}** has been released as **{callingName}**. Those who would like to express thanks for [his or her] service may show it by the uplifted hand.';

export const DEFAULT_STAND_BUSINESS_TEMPLATES = {
  WELCOME_NEW_MEMBER:
    'After a few words of introduction, we welcome **{memberName}** into the ward. Those who welcome [him or her] may show it by the uplifted hand. [Pause briefly.]',
  RECOGNIZE_BAPTIZED_CHILD:
    'We recognize **{memberName}**, who has been baptized. [Use the ward-approved introduction and welcome; this prompt does not replace the baptism or confirmation ordinance.]',
  BABY_BLESSING:
    'The blessing of **{memberName}** will take place after this meeting. [Confirm that the parents and participating priesthood holders are prepared before the ordinance.]',
  PRIESTHOOD_ORDINATION:
    'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]',
  PRIESTHOOD_ADVANCEMENT:
    'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]'
} as const;

export type StandDefaultTemplate = {
  welcomeText: string;
  sustainTemplate: string;
  releaseTemplate: string;
};

export const DEFAULT_STAND_TEMPLATES: Record<string, StandDefaultTemplate> = {
  'en-US': {
    welcomeText: DEFAULT_STAND_WELCOME_TEXT,
    sustainTemplate: DEFAULT_STAND_SUSTAIN_TEMPLATE,
    releaseTemplate: DEFAULT_STAND_RELEASE_TEMPLATE
  },
  es: {
    welcomeText: 'Bienvenidos a La Iglesia de Jesucristo de los Santos de los Últimos Días.',
    sustainTemplate:
      '**{memberName}** ha sido llamado como **{callingName}**. Los que estén a favor de sostenerlo pueden manifestarlo levantando la mano. [Haga una breve pausa.] Los que se opongan, si los hay, pueden manifestarlo también. [Haga una breve pausa.]',
    releaseTemplate:
      '**{memberName}** ha sido relevado como **{callingName}**. Los que deseen expresar gratitud por su servicio pueden manifestarlo levantando la mano.'
  },
  tl: {
    welcomeText: 'Malugod naming kayong tinatanggap sa Ang Simbahan ni Jesucristo ng mga Banal sa mga Huling Araw.',
    sustainTemplate:
      'Tinawag si **{memberName}** bilang **{callingName}**. Ang mga sumasang-ayon na sang-ayunan siya ay maaaring magtaas ng kamay. [Sandaling huminto.] Ang mga hindi sumasang-ayon, kung mayroon, ay maaari ring magtaas ng kamay. [Sandaling huminto.]',
    releaseTemplate:
      'Pinalaya na si **{memberName}** mula sa tungkulin bilang **{callingName}**. Ang mga nais magpasalamat sa kanyang paglilingkod ay maaaring magtaas ng kamay.'
  },
  to: {
    welcomeText: 'Mālō e tau tali mai ki he Siasi ʻo Sīsū Kalaisi ʻo e Kau Māʻoniʻoni ʻo e Ngaahi ʻAho Kimui Ní.',
    sustainTemplate:
      'Kuo uiuiʻi ʻa **{memberName}** ko e **{callingName}**. Ko kinautolu ʻoku poupou ke poupouʻi ia ʻe lava ke fakahaaʻi ʻaki hono hiki hake ʻo e nima. [Tatali nounou.] Ko kinautolu ʻoku fakafepaki, kapau ʻoku ʻi ai, ʻe lava foki ke fakahaaʻi. [Tatali nounou.]',
    releaseTemplate:
      'Kuo tukuange ʻa **{memberName}** mei hono uiuiʻi ko e **{callingName}**. Ko kinautolu ʻoku fie fakahaaʻi ʻenau houngaʻia ki heʻene ngāué ʻe lava ke fakahaaʻi ʻaki hono hiki hake ʻo e nima.'
  }
};

export function getDefaultStandTemplate(locale: string | null | undefined): StandDefaultTemplate {
  return DEFAULT_STAND_TEMPLATES[locale ?? ''] ?? DEFAULT_STAND_TEMPLATES['en-US'];
}
