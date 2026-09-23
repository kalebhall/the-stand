-- Milestone 7: published print inputs are immutable after insertion.
ALTER TABLE public.meeting_program_render
  ADD CONSTRAINT meeting_program_render_layout_json_shape
  CHECK (layout_json IS NULL OR (jsonb_typeof(layout_json) = 'object' AND (layout_json ->> 'schemaVersion') IN ('1', '2'))),
  ADD CONSTRAINT meeting_program_render_data_json_shape
  CHECK (render_data_json IS NULL OR jsonb_typeof(render_data_json) = 'object');

CREATE OR REPLACE FUNCTION public.prevent_published_print_input_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.layout_json IS DISTINCT FROM NEW.layout_json
     OR OLD.render_data_json IS DISTINCT FROM NEW.render_data_json THEN
    RAISE EXCEPTION 'published print inputs are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_program_render_print_inputs_immutable ON public.meeting_program_render;
CREATE TRIGGER meeting_program_render_print_inputs_immutable
BEFORE UPDATE ON public.meeting_program_render
FOR EACH ROW
EXECUTE FUNCTION public.prevent_published_print_input_mutation();

COMMENT ON FUNCTION public.prevent_published_print_input_mutation() IS 'Prevents mutation of immutable structured inputs captured for published program renders.';
