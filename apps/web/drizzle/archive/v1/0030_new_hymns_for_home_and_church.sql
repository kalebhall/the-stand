-- Add Hymns for Home and Church releases published June 25, 2026.
-- Source: Church music catalog API, collection hymns-for-home-and-church.
-- Keep this as a forward migration; previously applied migrations are immutable.

INSERT INTO hymn (hymn_number, title, book, sort_key)
SELECT v.hymn_number, v.title, 'NEW', v.sort_key
FROM (VALUES
  ('1052', 'Joyfully Bound', 1052),
  ('1053', 'My Covenants', 1053),
  ('1054', 'When I Am Baptized', 1054),
  ('1055', 'The Power of the Holy Ghost', 1055),
  ('1056', 'Elijah and the Still, Small Voice', 1056),
  ('1057', 'Jesus Is My Shepherd', 1057),
  ('1058', 'My Song in the Night', 1058),
  ('1059', 'This Is My Father’s World', 1059),
  ('1060', 'Build an Ark', 1060),
  ('1061', 'Love Will Bless Our Home', 1061),
  ('1062', 'Lord, Accept Our Humble Fast', 1062),
  ('1063', 'Peace, Peace, Be Still', 1063),
  ('1064', 'Great Is Thy Faithfulness', 1064),
  ('1065', 'Isaiah Said', 1065),
  ('1066', 'Fight the Good Fight', 1066),
  ('1067', 'It’s Joyful to Live the Gospel', 1067),
  ('1068', 'To God Be the Glory', 1068),
  ('1069', 'Speak to Us, Lord', 1069),
  ('1070', 'The Miracle', 1070),
  ('1071', 'What God Calls Us To', 1071),
  ('1072', 'When I Survey the Wondrous Cross', 1072)
) AS v(hymn_number, title, sort_key)
WHERE NOT EXISTS (
  SELECT 1 FROM hymn h
  WHERE h.hymn_number = v.hymn_number AND h.book = 'NEW'
);

INSERT INTO hymn (hymn_number, title, book, sort_key)
SELECT '1210', 'Long Ago, Within a Garden', 'NEW', 1210
WHERE NOT EXISTS (
  SELECT 1 FROM hymn h
  WHERE h.hymn_number = '1210' AND h.book = 'NEW'
);
