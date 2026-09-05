ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS template_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE ward_stand_template
   SET template_metadata = '{
     "welcome": {"classification":"WARD_PROMPT","sourceLabel":"Local ward prompt","sourceUrl":null},
     "sustain": {"classification":"WARD_PROMPT","sourceLabel":"Local ward prompt","sourceUrl":null},
     "release": {"classification":"WARD_PROMPT","sourceLabel":"Local ward prompt","sourceUrl":null},
     "welcomeNewMember": {"classification":"WARD_PROMPT","sourceLabel":"Local ward prompt","sourceUrl":null},
     "babyBlessing": {"classification":"HANDBOOK_REQUIRED_ELEMENTS","sourceLabel":"General Handbook 18","sourceUrl":"https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng"},
     "priesthoodOrdination": {"classification":"HANDBOOK_REQUIRED_ELEMENTS","sourceLabel":"General Handbook 18","sourceUrl":"https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng"},
     "priesthoodAdvancement": {"classification":"HANDBOOK_REQUIRED_ELEMENTS","sourceLabel":"General Handbook 18","sourceUrl":"https://www.churchofjesuschrist.org/study/manual/general-handbook/18-priesthood-ordinances-and-blessings?lang=eng"}
   }'::jsonb
 WHERE template_metadata = '{}'::jsonb;