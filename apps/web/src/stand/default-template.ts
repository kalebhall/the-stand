export const DEFAULT_STAND_WELCOME_TEXT =
  'Welcome to The Church of Jesus Christ of Latter-day Saints.';

export const DEFAULT_STAND_SUSTAIN_TEMPLATE =
  '**{memberName}** has been called as **{callingName}**. Those in favor of sustaining [him or her] may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]';

export const DEFAULT_STAND_RELEASE_TEMPLATE =
  '**{memberName}** has been released as **{callingName}**. Those who would like to express thanks for [his or her] service may show it by the uplifted hand.';

export const DEFAULT_STAND_BUSINESS_TEMPLATES = {
  WELCOME_NEW_MEMBER: 'After a few words of introduction, we welcome **{memberName}** into the ward by the uplifted hand.',
  BABY_BLESSING: 'The person acting as voice presents **{memberName}** and addresses Heavenly Father as in prayer, gives the child a name, addresses the child, gives a blessing as guided by the Spirit, and closes in the name of Jesus Christ.',
  PRIESTHOOD_ORDINATION: '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.',
  PRIESTHOOD_ADVANCEMENT: '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.'
} as const;
