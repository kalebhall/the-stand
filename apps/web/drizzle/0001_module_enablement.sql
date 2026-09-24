CREATE TABLE public.ward_module_enablement (
    ward_id uuid NOT NULL,
    module_id text NOT NULL,
    enabled boolean NOT NULL,
    updated_by_user_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ward_module_enablement_pkey PRIMARY KEY (ward_id, module_id),
    CONSTRAINT ward_module_enablement_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE,
    CONSTRAINT ward_module_enablement_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.user_account(id) ON DELETE RESTRICT,
    CONSTRAINT ward_module_enablement_module_id_check CHECK (length(btrim(module_id)) > 0),
    CONSTRAINT ward_module_enablement_core_enabled_check CHECK (module_id <> 'conducting-core' OR enabled)
);

CREATE INDEX ward_module_enablement_ward_enabled_idx
    ON public.ward_module_enablement (ward_id, enabled);

ALTER TABLE public.ward_module_enablement FORCE ROW LEVEL SECURITY;

CREATE POLICY ward_module_enablement_isolation
    ON public.ward_module_enablement
    USING (
        ward_id = app.current_ward_id()
        AND app.has_active_ward_access(ward_id)
    )
    WITH CHECK (
        ward_id = app.current_ward_id()
        AND app.has_active_ward_access(ward_id)
    );
