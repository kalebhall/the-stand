export const DEFAULT_STAND_WELCOME_TEXT = 'Welcome to The Church of Jesus Christ of Latter-day Saints.';

export const DEFAULT_STAND_SUSTAIN_TEMPLATE =
  '**{memberName}** has been called as **{callingName}**. Those in favor of sustaining [him or her] may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]';

export const DEFAULT_STAND_RELEASE_TEMPLATE =
  '**{memberName}** has been released as **{callingName}**. Those who would like to express thanks for [his or her] service may show it by the uplifted hand.';

export const DEFAULT_STAND_BUSINESS_TEMPLATES = {
  WELCOME_NEW_MEMBER:
    'After a few words of introduction, we welcome **{memberName}** into the ward. Those who welcome [him or her] may show it by the uplifted hand. [Pause briefly.]',
  BABY_BLESSING:
    'The blessing of **{memberName}** will take place after this meeting. [Confirm that the parents and participating priesthood holders are prepared before the ordinance.]',
  PRIESTHOOD_ORDINATION:
    'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]',
  PRIESTHOOD_ADVANCEMENT:
    'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]'
} as const;
