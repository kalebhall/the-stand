-- Milestone 7: preserve immutable structured inputs for published PDF downloads.
ALTER TABLE public.meeting_program_render
  ADD COLUMN IF NOT EXISTS layout_json JSONB,
  ADD COLUMN IF NOT EXISTS render_data_json JSONB;

COMMENT ON COLUMN public.meeting_program_render.layout_json IS 'Immutable normalized layout input used to reproduce this published render.';
COMMENT ON COLUMN public.meeting_program_render.render_data_json IS 'Immutable safe resolved data input used to reproduce this published render.';
