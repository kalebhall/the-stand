UPDATE ward_stand_template
SET welcome_new_member_template = 'After a few words of introduction, we welcome **{memberName}** into the ward. Those who welcome [him or her] may show it by the uplifted hand. [Pause briefly.]',
    updated_at = now()
WHERE welcome_new_member_template = 'After a few words of introduction, we welcome **{memberName}** into the ward by the uplifted hand.';

UPDATE ward_stand_template
SET baby_blessing_template = 'The blessing of **{memberName}** will take place after this meeting. [Confirm that the parents and participating priesthood holders are prepared before the ordinance.]',
    updated_at = now()
WHERE baby_blessing_template = 'The person acting as voice addresses Heavenly Father as in prayer, gives the child a name, addresses the child, gives a blessing as guided by the Spirit, and closes in the name of Jesus Christ.';

UPDATE ward_stand_template
SET priesthood_ordination_template = 'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]',
    updated_at = now()
WHERE priesthood_ordination_template = '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.';

UPDATE ward_stand_template
SET priesthood_advancement_template = 'It is proposed that **{memberName}** be ordained to the office of **{callingName}**. Those in favor may manifest it by the uplifted hand. Those opposed, if any, may manifest it. [After the vote, remind the authorized priesthood holder to perform the ordination.]',
    updated_at = now()
WHERE priesthood_advancement_template = '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.';
