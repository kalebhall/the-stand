-- Normalize seeded NEW hymnbook numbers to official non-overlapping values.
-- Existing deployments may still have legacy N-prefixed values.
UPDATE hymn
   SET hymn_number = SUBSTRING(hymn_number FROM 2)
 WHERE book = 'NEW'
   AND hymn_number ~ '^N[0-9]+$';
