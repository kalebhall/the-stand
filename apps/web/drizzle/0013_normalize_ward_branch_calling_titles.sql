-- Normalize ward calling titles while preserving branch-specific titles.
-- Branch titles carry a unit_type boundary and must not be merged into ward
-- titles, even when their display names would otherwise normalize identically.

CREATE TEMP TABLE calling_title_normalization ON COMMIT DROP AS
WITH prefixed AS (
  SELECT
    id AS source_id,
    name AS source_name,
    regexp_replace(name, '^(Ward|Branch) ', '') AS canonical_name,
    unit_type
  FROM public.standard_calling
  WHERE name ~ '^Ward '
),
canonical_existing AS (
  SELECT DISTINCT ON (p.source_id)
    p.source_id,
    p.source_name,
    p.canonical_name,
    p.unit_type,
    existing.id AS existing_id,
    conflicting.id AS conflicting_id,
    conflicting.unit_type AS conflicting_unit_type,
    COALESCE(existing.id, first_value(p.source_id) OVER (
      PARTITION BY p.canonical_name, p.unit_type
      ORDER BY (p.unit_type = 'ward') DESC, p.source_id
    )) AS keep_id
  FROM prefixed p
  LEFT JOIN public.standard_calling existing
    ON existing.name = p.canonical_name
   AND existing.unit_type = p.unit_type
   AND existing.id <> p.source_id
  LEFT JOIN public.standard_calling conflicting
    ON conflicting.name = p.canonical_name
   AND conflicting.id <> p.source_id
  ORDER BY p.source_id, existing.id
)
SELECT
  source_id,
  source_name,
  CASE WHEN existing_id IS NULL AND conflicting_id IS NOT NULL AND conflicting_unit_type <> unit_type
       THEN source_name
       ELSE canonical_name
  END AS canonical_name,
  keep_id
FROM canonical_existing;

-- Assignment and meeting-business rows intentionally retain their captured
-- display text. They have no authoritative standard-calling foreign key or
-- unit-type discriminator, so text-based rewrites could alter unrelated custom
-- assignments in another ward, branch, stake, or district.
DELETE FROM public.standard_calling standard
USING calling_title_normalization normalization
WHERE standard.id = normalization.source_id
  AND standard.id <> normalization.keep_id;

UPDATE public.standard_calling standard
SET name = normalization.canonical_name,
    updated_at = NOW()
FROM calling_title_normalization normalization
WHERE standard.id = normalization.keep_id;


