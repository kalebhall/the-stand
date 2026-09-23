-- Migration 0022: update default sustain and release templates to official phrasing
-- Only updates rows that are still using the previous default strings, preserving custom edits.

UPDATE ward_stand_template
SET sustain_template = '**{memberName}** has been called as **{callingName}**. Those in favor of sustaining [him or her] may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]'
WHERE sustain_template = 'Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.';

UPDATE ward_stand_template
SET release_template = '**{memberName}** has been released as  **{callingName}**. Those who would like to express thanks for [his or her] service may show it by the uplifted hand.'
WHERE release_template = 'Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.';
