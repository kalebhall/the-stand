-- Add ASSIGNED to the calling_action check constraint so that
-- calling_action rows inserted when converting a calling to assigned
-- do not violate the constraint.
ALTER TABLE calling_action
  DROP CONSTRAINT IF EXISTS calling_action_action_status_check;

ALTER TABLE calling_action
  ADD CONSTRAINT calling_action_action_status_check
  CHECK (action_status = ANY (ARRAY[
    'PROPOSED'::text,
    'EXTENDED'::text,
    'SUSTAINED'::text,
    'SET_APART'::text,
    'ASSIGNED'::text
  ]));
