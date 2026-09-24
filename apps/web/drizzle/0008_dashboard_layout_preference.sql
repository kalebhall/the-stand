CREATE TABLE public.dashboard_layout_preference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    user_id uuid NOT NULL,
    card_order jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_layout_preference_pkey PRIMARY KEY (id),
    CONSTRAINT dashboard_layout_preference_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE,
    CONSTRAINT dashboard_layout_preference_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE,
    CONSTRAINT dashboard_layout_preference_ward_user_unique UNIQUE (ward_id, user_id)
);

CREATE INDEX dashboard_layout_preference_ward_user_idx
    ON public.dashboard_layout_preference (ward_id, user_id);

ALTER TABLE public.dashboard_layout_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_layout_preference FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_layout_preference_isolation
    ON public.dashboard_layout_preference
    USING (
        ward_id = app.current_ward_id()
        AND user_id = app.current_user_id()
        AND app.has_active_ward_access(ward_id)
    )
    WITH CHECK (
        ward_id = app.current_ward_id()
        AND user_id = app.current_user_id()
        AND app.has_active_ward_access(ward_id)
    );
