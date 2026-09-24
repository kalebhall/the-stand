--
-- The Stand v2.0.0 clean-start database baseline.
-- Historical v1 migrations are preserved under archive/v1 and are not run for new installs.
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = on;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: can_administer_system_templates(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_administer_system_templates() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'app'
    SET row_security TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.user_global_role ugr ON ugr.user_id = u.id
      JOIN public.role r ON r.id = ugr.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND r.name IN ('SYSTEM_ADMIN', 'SUPPORT_ADMIN')
       AND r.scope = 'GLOBAL'
  )
$$;


--
-- Name: current_public_meeting_token(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_public_meeting_token() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.public_meeting_token', true), '')
$$;


--
-- Name: current_public_portal_token(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_public_portal_token() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.public_portal_token', true), '')
$$;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: current_ward_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_ward_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.ward_id', true), '')::uuid
$$;


--
-- Name: has_active_ward_access(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.has_active_ward_access(target_ward_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    SET row_security TO 'on'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account ua
      JOIN public.ward_user_role wur ON wur.user_id = ua.id
     WHERE ua.id = app.current_user_id()
       AND ua.is_active = true
       AND wur.user_id = app.current_user_id()
       AND wur.ward_id = target_ward_id
       AND wur.revoked_at IS NULL
       AND (wur.expires_at IS NULL OR wur.expires_at > pg_catalog.now())
  )
$$;


--
-- Name: is_stake_admin(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_stake_admin(target_stake_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'app'
    SET row_security TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.stake_user_role sur ON sur.user_id = u.id
      JOIN public.role r ON r.id = sur.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND sur.stake_id = target_stake_id
       AND sur.revoked_at IS NULL
       AND sur.granted_at <= now()
       AND r.name = 'STAKE_ADMIN'
       AND r.scope = 'STAKE'
  )
$$;


--
-- Name: is_support_admin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_support_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_global_role ugr
      JOIN role r ON r.id = ugr.role_id
     WHERE ugr.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
       AND r.name = 'SUPPORT_ADMIN'
  )
$$;


--
-- Name: is_system_admin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_system_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'app'
    SET row_security TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.user_global_role ugr ON ugr.user_id = u.id
      JOIN public.role r ON r.id = ugr.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND r.name = 'SYSTEM_ADMIN'
       AND r.scope = 'GLOBAL'
  )
$$;


--
-- Name: load_user_ward_access(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.load_user_ward_access(p_user_id uuid) RETURNS TABLE(ward_id uuid, stake_id uuid, role_name text, is_support_assignment boolean, expires_at timestamp with time zone, revoked_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    SET row_security TO 'on'
    AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'authenticated user context does not match requested user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT wur.ward_id,
         w.stake_id,
         r.name,
         wur.is_support_assignment,
         wur.expires_at,
         wur.revoked_at,
         wur.created_at
    FROM public.ward_user_role wur
    INNER JOIN public.ward w ON w.id = wur.ward_id
    INNER JOIN public.role r ON r.id = wur.role_id
   WHERE wur.user_id = p_user_id
     AND wur.revoked_at IS NULL
     AND (wur.expires_at IS NULL OR wur.expires_at > pg_catalog.now());
END;
$$;


--
-- Name: prevent_published_template_version_mutation(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.prevent_published_template_version_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'app'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = COALESCE(OLD.template_id, NEW.template_id)
       AND t.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Published template versions are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: validate_document_template_lineage(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_document_template_lineage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'app'
    AS $$
BEGIN
  IF NEW.source_template_id IS NULL THEN
    IF NEW.source_template_version IS NOT NULL THEN
      RAISE EXCEPTION 'source template version requires a source template' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.source_template_id = NEW.id THEN
    RAISE EXCEPTION 'template cannot be its own source' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.document_template source_template
    WHERE source_template.id = NEW.source_template_id
      AND source_template.status = 'PUBLISHED'
      AND source_template.current_published_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'source template must be published' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.document_template_version source_version
    WHERE source_version.template_id = NEW.source_template_id
      AND source_version.version = NEW.source_template_version
  ) THEN
    RAISE EXCEPTION 'source template version does not belong to source template' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_document_template_scope(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_document_template_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'app'
    AS $$
BEGIN
  IF NEW.scope_type = 'SYSTEM' THEN
    IF NEW.scope_id IS NOT NULL OR NEW.created_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'SYSTEM templates cannot have an owner scope';
    END IF;
  ELSIF NEW.scope_type = 'STAKE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stake s WHERE s.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'STAKE template scope must reference a stake';
    END IF;
  ELSIF NEW.scope_type IN ('WARD', 'PERSONAL_DRAFT') THEN
    IF NOT EXISTS (SELECT 1 FROM public.ward w WHERE w.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'WARD template scope must reference a ward';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported template scope';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: lookup_public_media_asset(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lookup_public_media_asset(p_token text) RETURNS TABLE(storage_key text, mime_type text, alt_text text, is_decorative boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    SET row_security TO 'off'
    AS $_$
  SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
    FROM public.media_asset m
   WHERE lower(m.public_token) = lower(p_token)
     AND m.status = 'ACTIVE'
     AND p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1
         FROM public.meeting_program_render r
         JOIN public.ward rw ON rw.id = r.ward_id
        WHERE r.render_html ILIKE ('%' || m.public_token || '%')
          AND (
            m.scope_type = 'SYSTEM'
            OR (m.scope_type = 'WARD' AND r.ward_id = m.ward_id)
            OR (m.scope_type = 'STAKE' AND rw.stake_id = m.stake_id)
          )
     )
   LIMIT 1
$_$;


--
-- Name: media_asset_archive(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_asset_archive(p_ward_id uuid, p_asset_id uuid) RETURNS TABLE(id uuid, storage_key text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    SET row_security TO 'off'
    AS $$
BEGIN
  IF p_ward_id IS DISTINCT FROM app.current_ward_id() THEN
    RAISE EXCEPTION 'media archive ward context mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ward_user_role wur
      JOIN role r ON r.id = wur.role_id
      JOIN user_account ua ON ua.id = wur.user_id
     WHERE wur.ward_id = p_ward_id
       AND wur.user_id = app.current_user_id()
       AND wur.revoked_at IS NULL
       AND (wur.expires_at IS NULL OR wur.expires_at > now())
       AND ua.is_active = true
       AND r.scope = 'WARD'
       AND (
         r.name IN ('STAND_ADMIN', 'BISHOPRIC_EDITOR')
         OR (r.name = 'PROGRAM_EDITOR' AND EXISTS (
           SELECT 1 FROM ward_document_settings wds
            WHERE wds.ward_id = p_ward_id
              AND wds.allow_program_editor_delete_media = true
         ))
       )
  ) THEN
    RAISE EXCEPTION 'media archive capability denied' USING ERRCODE = '42501';
  END IF;

  LOCK TABLE public.meeting_document, public.meeting_program_render IN SHARE MODE;

  RETURN QUERY
  UPDATE public.media_asset m
     SET status = 'ARCHIVED', public_token = NULL, updated_at = now()
   WHERE m.id = p_asset_id
     AND m.ward_id = p_ward_id
     AND m.scope_type = 'WARD'
     AND m.status = 'ACTIVE'
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_document md
        WHERE md.ward_id = m.ward_id
          AND md.layout_json::text LIKE ('%' || m.id::text || '%')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_program_render r
        WHERE r.ward_id = m.ward_id
          AND r.render_html LIKE ('%' || m.public_token || '%')
     )
  RETURNING m.id, m.storage_key;
END
$$;


--
-- Name: media_asset_immutable_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.media_asset_immutable_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.scope_type <> OLD.scope_type OR NEW.ward_id IS DISTINCT FROM OLD.ward_id
     OR NEW.stake_id IS DISTINCT FROM OLD.stake_id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.storage_key <> OLD.storage_key OR NOT (NEW.status = OLD.status OR (OLD.status = 'ACTIVE' AND NEW.status IN ('ARCHIVED', 'QUARANTINED')))
     OR (NOT (OLD.status = 'ACTIVE' AND NEW.status IN ('ARCHIVED', 'QUARANTINED')) AND NEW.public_token IS DISTINCT FROM OLD.public_token)
     OR NEW.filename <> OLD.filename OR NEW.mime_type <> OLD.mime_type OR NEW.byte_size <> OLD.byte_size
     OR NEW.pixel_width <> OLD.pixel_width OR NEW.pixel_height <> OLD.pixel_height
     OR NEW.alt_text IS DISTINCT FROM OLD.alt_text OR NEW.is_decorative <> OLD.is_decorative
     OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'media asset immutable fields cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: prevent_published_print_input_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_published_print_input_mutation() RETURNS trigger
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


--
-- Name: prevent_published_render_publication_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_published_render_publication_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'published render cannot be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.published_at IS NOT NULL
     AND (OLD.id IS DISTINCT FROM NEW.id
       OR OLD.ward_id IS DISTINCT FROM NEW.ward_id
       OR OLD.meeting_id IS DISTINCT FROM NEW.meeting_id
       OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.render_html IS DISTINCT FROM NEW.render_html
       OR OLD.layout_json IS DISTINCT FROM NEW.layout_json
       OR OLD.render_data_json IS DISTINCT FROM NEW.render_data_json
       OR OLD.document_type IS DISTINCT FROM NEW.document_type
       OR OLD.source_template_id IS DISTINCT FROM NEW.source_template_id
       OR OLD.source_template_version IS DISTINCT FROM NEW.source_template_version
       OR OLD.published_by_user_id IS DISTINCT FROM NEW.published_by_user_id
       OR OLD.published_at IS DISTINCT FROM NEW.published_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.publication_metadata_json IS DISTINCT FROM NEW.publication_metadata_json) THEN
    RAISE EXCEPTION 'published render publication metadata is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_public_program_share_active_render(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_public_program_share_active_render() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.active_render_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.meeting_program_render AS render
       WHERE render.id = NEW.active_render_id
         AND render.ward_id = NEW.ward_id
         AND render.meeting_id = NEW.meeting_id
         AND render.published_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'active public program render must be published and match the share ward and meeting' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: access_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    stake text NOT NULL,
    ward text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    start_date date,
    end_date date,
    is_permanent boolean DEFAULT false NOT NULL,
    placement text DEFAULT 'PROGRAM_TOP'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    include_in_program boolean DEFAULT true NOT NULL,
    include_in_stand boolean DEFAULT false NOT NULL,
    CONSTRAINT announcement_placement_check CHECK ((placement = ANY (ARRAY['PROGRAM_TOP'::text, 'PROGRAM_BOTTOM'::text])))
);

ALTER TABLE ONLY public.announcement FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid,
    user_id uuid,
    action text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_name text,
    actor_role text,
    target_member_id uuid,
    target_member_name text,
    entity_type text,
    entity_id text,
    changes jsonb,
    previous_state jsonb,
    source text DEFAULT 'manual_ui'::text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    is_cross_ward_support boolean DEFAULT false NOT NULL,
    calling_name text,
    organization text,
    calling_status text,
    effective_date date,
    meeting_date date,
    item_type text,
    item_title text,
    ip_address text,
    user_agent text,
    session_id text
);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: bishopric_action; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bishopric_action (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    bishopric_meeting_id uuid NOT NULL,
    title text NOT NULL,
    details text,
    decision text,
    owner_name text,
    due_date date,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    carry_forward boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    completed_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    member_id uuid,
    calling_assignment_id uuid,
    linked_membership_action_id uuid,
    CONSTRAINT bishopric_action_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text]))),
    CONSTRAINT bishopric_action_visibility_check CHECK ((visibility = 'PRIVATE'::text))
);


--
-- Name: bishopric_meeting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bishopric_meeting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_date date NOT NULL,
    agenda_template text DEFAULT 'BISHOPRIC'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meeting_type text DEFAULT 'BISHOPRIC'::text NOT NULL,
    CONSTRAINT bishopric_meeting_meeting_type_check CHECK ((meeting_type = ANY (ARRAY['BISHOPRIC'::text, 'WARD_COUNCIL'::text, 'MISSIONARY_COORDINATION'::text]))),
    CONSTRAINT bishopric_meeting_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'COMPLETED'::text])))
);


--
-- Name: calendar_event_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_event_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    calendar_feed_id uuid NOT NULL,
    external_uid text NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    all_day boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    source_updated_at timestamp with time zone,
    copied_to_announcement_at timestamp with time zone,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.calendar_event_cache FORCE ROW LEVEL SECURITY;


--
-- Name: calendar_feed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_feed (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    display_name text NOT NULL,
    feed_scope text NOT NULL,
    feed_url text NOT NULL,
    tag_map jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_refreshed_at timestamp with time zone,
    last_refresh_status text,
    last_refresh_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_feed_feed_scope_check CHECK ((feed_scope = ANY (ARRAY['WARD'::text, 'STAKE'::text, 'CHURCH'::text])))
);

ALTER TABLE ONLY public.calendar_feed FORCE ROW LEVEL SECURITY;


--
-- Name: calling_action; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calling_action (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    calling_assignment_id uuid NOT NULL,
    action_status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calling_action_action_status_check CHECK ((action_status = ANY (ARRAY['PROPOSED'::text, 'EXTENDED'::text, 'SUSTAINED'::text, 'SET_APART'::text, 'ASSIGNED'::text, 'TO_BE_RELEASED'::text])))
);

ALTER TABLE ONLY public.calling_action FORCE ROW LEVEL SECURITY;


--
-- Name: calling_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calling_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    member_name text NOT NULL,
    calling_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    member_id uuid,
    organization text,
    set_apart boolean DEFAULT false NOT NULL,
    sustained_date date
);

ALTER TABLE ONLY public.calling_assignment FORCE ROW LEVEL SECURITY;


--
-- Name: document_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_type text NOT NULL,
    scope_id uuid,
    document_type text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    current_published_version_id uuid,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    template_key text,
    distribution_policy text DEFAULT 'DUPLICATE_AND_CUSTOMIZE'::text NOT NULL,
    source_template_id uuid,
    source_template_version integer,
    published_by_user_id uuid,
    published_at timestamp with time zone,
    CONSTRAINT document_template_check CHECK ((((scope_type = 'SYSTEM'::text) AND (scope_id IS NULL)) OR ((scope_type <> 'SYSTEM'::text) AND (scope_id IS NOT NULL)))),
    CONSTRAINT document_template_distribution_policy_check CHECK ((distribution_policy = ANY (ARRAY['USE_AS_IS'::text, 'DUPLICATE_AND_CUSTOMIZE'::text, 'REQUIRED'::text]))),
    CONSTRAINT document_template_document_type_check CHECK ((document_type = 'SACRAMENT_PROGRAM'::text)),
    CONSTRAINT document_template_lineage_check CHECK (((source_template_id IS NULL) OR (source_template_id <> id))),
    CONSTRAINT document_template_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200))),
    CONSTRAINT document_template_publication_consistency_check CHECK (((status <> 'PUBLISHED'::text) OR ((published_at IS NOT NULL) AND (current_published_version_id IS NOT NULL)))),
    CONSTRAINT document_template_scope_tenancy_check CHECK ((((scope_type = 'SYSTEM'::text) AND (scope_id IS NULL) AND (created_by_user_id IS NULL)) OR ((scope_type = ANY (ARRAY['STAKE'::text, 'WARD'::text, 'PERSONAL_DRAFT'::text])) AND (scope_id IS NOT NULL)))),
    CONSTRAINT document_template_scope_type_check CHECK ((scope_type = ANY (ARRAY['SYSTEM'::text, 'STAKE'::text, 'WARD'::text, 'PERSONAL_DRAFT'::text]))),
    CONSTRAINT document_template_source_pair_check CHECK ((((source_template_id IS NULL) AND (source_template_version IS NULL)) OR ((source_template_id IS NOT NULL) AND (source_template_version IS NOT NULL) AND (source_template_version > 0)))),
    CONSTRAINT document_template_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ARCHIVED'::text])))
);

ALTER TABLE ONLY public.document_template FORCE ROW LEVEL SECURITY;


--
-- Name: document_template_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_template_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    version integer NOT NULL,
    schema_version integer NOT NULL,
    layout_json jsonb NOT NULL,
    theme_json jsonb NOT NULL,
    lock_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_template_version_lock_json_shape CHECK ((jsonb_typeof(lock_json) = 'object'::text)),
    CONSTRAINT document_template_version_schema_matches_json CHECK (((layout_json ? 'schemaVersion'::text) AND (((layout_json ->> 'schemaVersion'::text))::integer = schema_version))),
    CONSTRAINT document_template_version_schema_supported CHECK ((schema_version = ANY (ARRAY[1, 2]))),
    CONSTRAINT document_template_version_schema_version_check CHECK ((schema_version > 0)),
    CONSTRAINT document_template_version_schema_version_positive CHECK ((schema_version > 0)),
    CONSTRAINT document_template_version_version_check CHECK ((version > 0)),
    CONSTRAINT document_template_version_version_positive CHECK ((version > 0))
);

ALTER TABLE ONLY public.document_template_version FORCE ROW LEVEL SECURITY;


--
-- Name: event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.event_outbox FORCE ROW LEVEL SECURITY;


--
-- Name: global_event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_event_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT global_event_outbox_event_type_check CHECK ((event_type = ANY (ARRAY['SUPPORT_REQUEST_CREATED'::text, 'USER_REQUIRES_ASSIGNMENT'::text, 'SUPPORT_REQUEST_ASSIGNED'::text, 'SUPPORT_REQUEST_STATUS_CHANGED'::text, 'SUPPORT_REQUEST_REMINDER'::text]))),
    CONSTRAINT global_event_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text])))
);


--
-- Name: global_notification_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_notification_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    global_event_outbox_id uuid NOT NULL,
    recipient_user_id uuid,
    channel text NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    external_id text,
    error_message text,
    attempted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT global_notification_delivery_channel_check CHECK ((channel = ANY (ARRAY['IN_APP'::text, 'EMAIL'::text])))
);


--
-- Name: global_user_notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_user_notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid NOT NULL,
    source_event_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    details jsonb,
    severity text DEFAULT 'info'::text NOT NULL,
    target_url text,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: historical_import_name_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historical_import_name_review (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    source_name text NOT NULL,
    normalized_name text NOT NULL,
    occurrence_count integer DEFAULT 1 NOT NULL,
    first_seen_date date NOT NULL,
    last_seen_date date NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    matched_member_id uuid,
    resolved_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT historical_import_name_review_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'RESOLVED'::text, 'IGNORED'::text])))
);

ALTER TABLE ONLY public.historical_import_name_review FORCE ROW LEVEL SECURITY;


--
-- Name: hymn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hymn (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hymn_number text NOT NULL,
    title text NOT NULL,
    book text NOT NULL,
    sort_key integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hymn_book_check CHECK ((book = ANY (ARRAY['STANDARD'::text, 'NEW'::text, 'CHILDRENS'::text])))
);


--
-- Name: import_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    import_type text NOT NULL,
    raw_text text NOT NULL,
    parsed_count integer DEFAULT 0 NOT NULL,
    committed boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_run_import_type_check CHECK ((import_type = ANY (ARRAY['MEMBERSHIP'::text, 'CALLINGS'::text])))
);

ALTER TABLE ONLY public.import_run FORCE ROW LEVEL SECURITY;


--
-- Name: internal_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    member_id uuid,
    meeting_id uuid,
    program_item_id uuid,
    visibility text NOT NULL,
    note_text text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bishopric_action_id uuid,
    CONSTRAINT internal_note_exactly_one_target CHECK (((((((member_id IS NOT NULL))::integer + ((meeting_id IS NOT NULL))::integer) + ((program_item_id IS NOT NULL))::integer) + ((bishopric_action_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT internal_note_note_text_check CHECK ((length(btrim(note_text)) > 0)),
    CONSTRAINT internal_note_visibility_check CHECK ((visibility = ANY (ARRAY['PUBLIC'::text, 'LEADERSHIP'::text, 'PRIVATE'::text])))
);

ALTER TABLE ONLY public.internal_note FORCE ROW LEVEL SECURITY;


--
-- Name: interview_calendar_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_calendar_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_by_user_id uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.interview_calendar_subscription FORCE ROW LEVEL SECURITY;


--
-- Name: media_asset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_asset (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope_type text NOT NULL,
    ward_id uuid,
    stake_id uuid,
    owner_user_id uuid,
    filename text NOT NULL,
    storage_key text NOT NULL,
    public_token text,
    mime_type text NOT NULL,
    byte_size integer NOT NULL,
    pixel_width integer NOT NULL,
    pixel_height integer NOT NULL,
    alt_text text,
    is_decorative boolean DEFAULT false NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_asset_byte_size_check CHECK (((byte_size > 0) AND (byte_size <= 10485760))),
    CONSTRAINT media_asset_check CHECK ((((scope_type = 'WARD'::text) AND (ward_id IS NOT NULL) AND (stake_id IS NULL)) OR ((scope_type = 'STAKE'::text) AND (ward_id IS NULL) AND (stake_id IS NOT NULL)) OR ((scope_type = 'SYSTEM'::text) AND (ward_id IS NULL) AND (stake_id IS NULL)))),
    CONSTRAINT media_asset_check1 CHECK ((is_decorative OR (length(TRIM(BOTH FROM COALESCE(alt_text, ''::text))) > 0))),
    CONSTRAINT media_asset_filename_check CHECK (((length(TRIM(BOTH FROM filename)) >= 1) AND (length(TRIM(BOTH FROM filename)) <= 255))),
    CONSTRAINT media_asset_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT media_asset_pixel_height_check CHECK (((pixel_height > 0) AND (pixel_height <= 25000000))),
    CONSTRAINT media_asset_pixel_width_check CHECK (((pixel_width > 0) AND (pixel_width <= 25000000))),
    CONSTRAINT media_asset_scope_type_check CHECK ((scope_type = ANY (ARRAY['SYSTEM'::text, 'STAKE'::text, 'WARD'::text]))),
    CONSTRAINT media_asset_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text, 'QUARANTINED'::text])))
);

ALTER TABLE ONLY public.media_asset FORCE ROW LEVEL SECURITY;


--
-- Name: meeting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_date date NOT NULL,
    meeting_type text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location text
);

ALTER TABLE ONLY public.meeting FORCE ROW LEVEL SECURITY;


--
-- Name: meeting_business_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_business_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    member_name text NOT NULL,
    calling_name text NOT NULL,
    action_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    calling_assignment_id uuid,
    CONSTRAINT meeting_business_line_action_type_check CHECK ((action_type = ANY (ARRAY['SUSTAIN'::text, 'RELEASE'::text]))),
    CONSTRAINT meeting_business_line_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'included'::text, 'excluded'::text, 'announced'::text])))
);

ALTER TABLE ONLY public.meeting_business_line FORCE ROW LEVEL SECURITY;


--
-- Name: meeting_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    document_type text NOT NULL,
    source_template_id uuid,
    source_template_version integer,
    schema_version integer NOT NULL,
    layout_json jsonb NOT NULL,
    theme_json jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_document_document_type_check CHECK ((document_type = 'SACRAMENT_PROGRAM'::text)),
    CONSTRAINT meeting_document_revision_check CHECK ((revision > 0)),
    CONSTRAINT meeting_document_schema_version_check CHECK ((schema_version > 0)),
    CONSTRAINT meeting_document_schema_version_matches_json CHECK (((layout_json ? 'schemaVersion'::text) AND (((layout_json ->> 'schemaVersion'::text))::integer = schema_version))),
    CONSTRAINT meeting_document_schema_version_supported CHECK ((schema_version = ANY (ARRAY[1, 2])))
);

ALTER TABLE ONLY public.meeting_document FORCE ROW LEVEL SECURITY;


--
-- Name: meeting_membership_ordinance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_membership_ordinance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    member_name text NOT NULL,
    action_type text NOT NULL,
    reason text,
    details text,
    status text DEFAULT 'pending'::text NOT NULL,
    announced_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    planned_date date,
    interview_status text DEFAULT 'not_required'::text NOT NULL,
    interview_date date,
    interviewer_name text,
    responsible_leader text,
    lcr_follow_up_status text DEFAULT 'not_applicable'::text NOT NULL,
    lcr_updated_at timestamp with time zone,
    record_form_needed boolean DEFAULT false NOT NULL,
    handoff_date date,
    official_record_updated_by text,
    certificate_or_form_delivered boolean DEFAULT false NOT NULL,
    official_system_follow_up_status text DEFAULT 'not_started'::text NOT NULL,
    official_system_reference_url text,
    priesthood_office text,
    approval_confirmed boolean DEFAULT false NOT NULL,
    presenting_leader text,
    performing_priesthood_holder text,
    ordinance_date date,
    baptism_date date,
    confirmation_date date,
    baptism_status text,
    confirmation_status text,
    CONSTRAINT meeting_membership_ordinance_action_type_check CHECK ((action_type = ANY (ARRAY['WELCOME_NEW_MEMBER'::text, 'RECOGNIZE_BAPTIZED_CHILD'::text, 'BAPTISM_CONFIRMATION_FOLLOW_UP'::text, 'ATTENDANCE_LCR_HANDOFF'::text, 'BABY_BLESSING'::text, 'PRIESTHOOD_ORDINATION'::text, 'PRIESTHOOD_ADVANCEMENT'::text]))),
    CONSTRAINT meeting_membership_ordinance_baptism_status_check CHECK (((baptism_status IS NULL) OR (baptism_status = ANY (ARRAY['planned'::text, 'completed'::text, 'cancelled'::text])))),
    CONSTRAINT meeting_membership_ordinance_confirmation_status_check CHECK (((confirmation_status IS NULL) OR (confirmation_status = ANY (ARRAY['planned'::text, 'completed'::text, 'cancelled'::text])))),
    CONSTRAINT meeting_membership_ordinance_interview_status_check CHECK ((interview_status = ANY (ARRAY['not_required'::text, 'needed'::text, 'scheduled'::text, 'completed'::text]))),
    CONSTRAINT meeting_membership_ordinance_lcr_follow_up_status_check CHECK ((lcr_follow_up_status = ANY (ARRAY['not_applicable'::text, 'needed'::text, 'completed'::text]))),
    CONSTRAINT meeting_membership_ordinance_official_system_follow_up_status_c CHECK ((official_system_follow_up_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'not_applicable'::text]))),
    CONSTRAINT meeting_membership_ordinance_priesthood_office_check CHECK (((priesthood_office IS NULL) OR (priesthood_office = ANY (ARRAY['DEACON'::text, 'TEACHER'::text, 'PRIEST'::text, 'ELDER'::text, 'HIGH_PRIEST'::text, 'UNKNOWN'::text])))),
    CONSTRAINT meeting_membership_ordinance_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'announced'::text, 'action_needed'::text, 'completed'::text])))
);


--
-- Name: meeting_program_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_program_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    sequence integer NOT NULL,
    item_type text NOT NULL,
    title text,
    notes text,
    hymn_number text,
    hymn_title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_notes text,
    topic text,
    introduction_roles jsonb,
    speaker_status text,
    CONSTRAINT meeting_program_item_speaker_status_check CHECK (((speaker_status IS NULL) OR (speaker_status = ANY (ARRAY['PLANNED'::text, 'INVITED'::text, 'ACCEPTED'::text, 'CONFIRMED'::text, 'COMPLETED'::text]))))
);

ALTER TABLE ONLY public.meeting_program_item FORCE ROW LEVEL SECURITY;


--
-- Name: meeting_program_render; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_program_render (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    version integer NOT NULL,
    render_html text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    layout_json jsonb,
    render_data_json jsonb,
    document_type text DEFAULT 'SACRAMENT_PROGRAM'::text NOT NULL,
    source_template_id uuid,
    source_template_version integer,
    published_by_user_id uuid,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    publication_metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT meeting_program_render_data_json_shape CHECK (((render_data_json IS NULL) OR (jsonb_typeof(render_data_json) = 'object'::text))),
    CONSTRAINT meeting_program_render_document_type_check CHECK ((document_type = 'SACRAMENT_PROGRAM'::text)),
    CONSTRAINT meeting_program_render_layout_json_render_data_json_consistent CHECK ((((layout_json IS NULL) AND (render_data_json IS NULL)) OR ((layout_json IS NOT NULL) AND (render_data_json IS NOT NULL)))),
    CONSTRAINT meeting_program_render_layout_json_shape CHECK (((layout_json IS NULL) OR ((jsonb_typeof(layout_json) = 'object'::text) AND ((layout_json ->> 'schemaVersion'::text) = ANY (ARRAY['1'::text, '2'::text]))))),
    CONSTRAINT meeting_program_render_publication_metadata_json_shape CHECK ((jsonb_typeof(publication_metadata_json) = 'object'::text)),
    CONSTRAINT meeting_program_render_source_template_pair CHECK ((((source_template_id IS NULL) AND (source_template_version IS NULL)) OR ((source_template_id IS NOT NULL) AND (source_template_version IS NOT NULL) AND (source_template_version > 0))))
);

ALTER TABLE ONLY public.meeting_program_render FORCE ROW LEVEL SECURITY;


--
-- Name: meeting_technology_checklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_technology_checklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    owner_name text,
    room_ready boolean DEFAULT false NOT NULL,
    audio_ready boolean DEFAULT false NOT NULL,
    stream_ready boolean DEFAULT false NOT NULL,
    accessibility_checked boolean DEFAULT false NOT NULL,
    authorized_link text,
    start_confirmed_at timestamp with time zone,
    stop_confirmed_at timestamp with time zone,
    recording_deletion_reminder boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    age integer,
    gender text,
    archived_at timestamp with time zone,
    first_name text,
    last_name text,
    identity_key text
);

ALTER TABLE ONLY public.member FORCE ROW LEVEL SECURITY;


--
-- Name: member_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    member_id uuid NOT NULL,
    note_text text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.member_note FORCE ROW LEVEL SECURITY;


--
-- Name: notification_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    event_outbox_id uuid NOT NULL,
    channel text NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    external_id text,
    error_message text,
    attempted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_user_id uuid,
    CONSTRAINT notification_delivery_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'success'::text, 'failure'::text])))
);

ALTER TABLE ONLY public.notification_delivery FORCE ROW LEVEL SECURITY;


--
-- Name: notification_email_digest_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_email_digest_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    event_outbox_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    digest_frequency text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    target_url text,
    attempted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_email_digest_item_digest_frequency_check CHECK ((digest_frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text])))
);

ALTER TABLE ONLY public.notification_email_digest_item FORCE ROW LEVEL SECURITY;


--
-- Name: notification_email_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_email_preference (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    user_id uuid NOT NULL,
    frequency text DEFAULT 'IMMEDIATE'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_email_preference_frequency_check CHECK ((frequency = ANY (ARRAY['IMMEDIATE'::text, 'DAILY'::text, 'WEEKLY'::text])))
);

ALTER TABLE ONLY public.notification_email_preference FORCE ROW LEVEL SECURITY;


--
-- Name: notification_subscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_subscription_channel_check CHECK ((channel = ANY (ARRAY['IN_APP'::text, 'EMAIL'::text])))
);

ALTER TABLE ONLY public.notification_subscription FORCE ROW LEVEL SECURITY;


--
-- Name: offline_mutation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_mutation (
    mutation_id uuid NOT NULL,
    ward_id uuid NOT NULL,
    user_id uuid NOT NULL,
    operation text NOT NULL,
    status text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    meeting_id uuid,
    CONSTRAINT offline_mutation_status_check CHECK ((status = ANY (ARRAY['APPLIED'::text, 'CONFLICT'::text, 'REJECTED'::text])))
);

ALTER TABLE ONLY public.offline_mutation FORCE ROW LEVEL SECURITY;


--
-- Name: public_program_layout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_program_layout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    preset text DEFAULT 'SINGLE_SHEET_BIFOLD'::text NOT NULL,
    announcement_mode text DEFAULT 'AFTER_PROGRAM'::text NOT NULL,
    cover_mode text DEFAULT 'NONE'::text NOT NULL,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cover_image_url text,
    cover_image_alt_text text,
    CONSTRAINT public_program_layout_announcement_mode_check CHECK ((announcement_mode = ANY (ARRAY['NONE'::text, 'AFTER_PROGRAM'::text, 'BACK_PANEL'::text]))),
    CONSTRAINT public_program_layout_cover_alt_text_check CHECK (((cover_image_url IS NULL) OR ((length(TRIM(BOTH FROM cover_image_alt_text)) >= 1) AND (length(TRIM(BOTH FROM cover_image_alt_text)) <= 240)))),
    CONSTRAINT public_program_layout_cover_image_url_check CHECK (((cover_image_url IS NULL) OR (cover_image_url ~ '^https://'::text))),
    CONSTRAINT public_program_layout_cover_mode_check CHECK ((cover_mode = ANY (ARRAY['NONE'::text, 'AUTHORIZED_IMAGE'::text]))),
    CONSTRAINT public_program_layout_preset_check CHECK ((preset = ANY (ARRAY['SINGLE_SHEET_BIFOLD'::text, 'TRI_FOLD_BULLETIN'::text, 'FULL_PAGE'::text])))
);


--
-- Name: public_program_portal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_program_portal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.public_program_portal FORCE ROW LEVEL SECURITY;


--
-- Name: public_program_share; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_program_share (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    active_render_id uuid,
    expires_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.public_program_share FORCE ROW LEVEL SECURITY;


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    CONSTRAINT role_scope_check CHECK ((scope = ANY (ARRAY['GLOBAL'::text, 'WARD'::text, 'STAKE'::text])))
);


--
-- Name: scheduled_interview; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_interview (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    interview_type text NOT NULL,
    member_name text NOT NULL,
    interviewer_name text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'SCHEDULED'::text NOT NULL,
    linked_action_id uuid,
    linked_calling_id uuid,
    private_note text,
    completed_at timestamp with time zone,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduled_interview_status_check CHECK ((status = ANY (ARRAY['SCHEDULED'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: stake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stake (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stake_user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stake_user_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stake_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by_user_id uuid,
    revoked_at timestamp with time zone,
    revoked_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stake_user_role_revocation_order CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at)))
);

ALTER TABLE ONLY public.stake_user_role FORCE ROW LEVEL SECURITY;


--
-- Name: standard_calling; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standard_calling (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    organization text,
    unit_type text DEFAULT 'ward'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_work_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_work_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    status text DEFAULT 'UNASSIGNED'::text NOT NULL,
    assigned_to_user_id uuid,
    claimed_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminded_at timestamp with time zone,
    CONSTRAINT support_work_item_source_type_check CHECK ((source_type = ANY (ARRAY['ACCESS_REQUEST'::text, 'USER_ACCOUNT'::text]))),
    CONSTRAINT support_work_item_status_check CHECK ((status = ANY (ARRAY['UNASSIGNED'::text, 'ASSIGNED'::text, 'IN_PROGRESS'::text, 'WAITING'::text, 'RESOLVED'::text, 'CLOSED'::text])))
);


--
-- Name: user_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text,
    password_hash text,
    must_change_password boolean DEFAULT false NOT NULL,
    last_password_change_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferred_locale text,
    CONSTRAINT user_account_preferred_locale_check CHECK (((preferred_locale IS NULL) OR (preferred_locale = ANY (ARRAY['en-US'::text, 'es'::text, 'pt-BR'::text, 'tl'::text]))))
);


--
-- Name: user_global_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_global_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    source_event_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    details jsonb,
    severity text DEFAULT 'info'::text NOT NULL,
    target_url text,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_notification_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])))
);

ALTER TABLE ONLY public.user_notification FORCE ROW LEVEL SECURITY;


--
-- Name: ward; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stake_id uuid NOT NULL,
    name text NOT NULL,
    unit_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ward_document_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward_document_settings (
    ward_id uuid NOT NULL,
    default_sacrament_template_id uuid,
    allow_advanced_program_designer boolean DEFAULT false NOT NULL,
    allow_program_editor_publish boolean DEFAULT false NOT NULL,
    allow_program_editor_republish boolean DEFAULT false NOT NULL,
    allow_program_editor_rollback boolean DEFAULT false NOT NULL,
    allow_program_editor_create_templates boolean DEFAULT false NOT NULL,
    allow_program_editor_delete_media boolean DEFAULT false NOT NULL,
    public_program_expiration_days integer,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ward_document_settings_public_program_expiration_days_check CHECK (((public_program_expiration_days IS NULL) OR (public_program_expiration_days > 0)))
);

ALTER TABLE ONLY public.ward_document_settings FORCE ROW LEVEL SECURITY;


--
-- Name: ward_feature_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward_feature_settings (
    ward_id uuid NOT NULL,
    bishopric_agenda boolean DEFAULT true NOT NULL,
    scheduled_interviews boolean DEFAULT true NOT NULL,
    technology_checklist boolean DEFAULT true NOT NULL,
    speaker_lifecycle boolean DEFAULT true NOT NULL,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ward_stand_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward_stand_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    welcome_text text DEFAULT 'Welcome to The Church of Jesus Christ of Latter-day Saints.'::text NOT NULL,
    sustain_template text DEFAULT '**{memberName}** has been called as **{callingName}**. Those in favor of sustaining [him or her] may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]'::text NOT NULL,
    release_template text DEFAULT '**{memberName}** has been released as  **{callingName}**. Those who would like to express thanks for [his or her] service may show it by the uplifted hand.'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    welcome_new_member_template text DEFAULT 'Would **{memberName}** please stand. **{memberName}** [moved into the ward / was baptized] all those who would like to welcome **{memberName}** into the ward please do so by the uplifted hand.'::text NOT NULL,
    baby_blessing_template text DEFAULT 'We will now have a baby blessing for the **{lastName}** baby.'::text NOT NULL,
    priesthood_ordination_template text DEFAULT 'We propose that **{memberName}** receive the Aaronic Priesthood and be ordained a **{callingName}**. Those in favor may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]'::text NOT NULL,
    priesthood_advancement_template text DEFAULT 'We propose that **{memberName}** be ordained a **{callingName}**. Those in favor may show it by the uplifted hand. [Pause briefly.] Those opposed, if any, may also show it. [Pause briefly.]'::text NOT NULL,
    recognize_baptized_child_template text DEFAULT '**{memberName}** was baptized recently and we would like to reconize them as a new member of the ward.'::text NOT NULL,
    template_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY public.ward_stand_template FORCE ROW LEVEL SECURITY;


--
-- Name: ward_user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ward_user_role (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ward_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_support_assignment boolean DEFAULT false NOT NULL,
    granted_by_user_id uuid,
    grant_reason text,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by_user_id uuid
);

ALTER TABLE ONLY public.ward_user_role FORCE ROW LEVEL SECURITY;


--
-- PostgreSQL database dump complete

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: access_request; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: announcement; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: bishopric_action; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: bishopric_meeting; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: calendar_event_cache; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: calendar_feed; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: calling_action; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: calling_assignment; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: document_template; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.document_template VALUES ('2c4d5931-0f6a-4dc6-9572-ce98397f2039', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Classic Bifold', 'Traditional folded program with a balanced reading order.', 'PUBLISHED', '99166a17-d71d-4d95-8d17-6fd0f24f6ca8', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'classic-bifold', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('072e2017-45df-46ac-bd2d-2da49d5f3a4e', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Trifold Bulletin', 'Compact three-panel bulletin layout.', 'PUBLISHED', 'b706cee2-84f2-4408-a9ef-ae7bb78c5623', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'trifold-bulletin', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('dac04293-211e-451b-96b7-8a11b0ce007d', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Full Page Standard', 'Readable single-page program for digital and print use.', 'PUBLISHED', '78991541-c4b1-4ed3-b2b3-8b79cc0aac40', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'full-page-standard', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('f336f12f-55b6-4a80-9b97-79a506b47c77', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Modern Minimal', 'Clean text-first layout with restrained visual hierarchy.', 'PUBLISHED', '8837a8c5-d6c6-4e7b-bbce-ca847cb5b0c7', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'modern-minimal', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('73f93d25-52ab-4fba-b6fa-1b277a4cfd0d', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Compact One Page', 'Dense one-page format for shorter programs.', 'PUBLISHED', 'e4858b93-7778-48e4-ab2f-053cbd7422a0', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'compact-one-page', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('c74015e2-81e0-40ad-bdab-4e29340eb094', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Large Print', 'Simplified layout intended for comfortable reading.', 'PUBLISHED', '9dd26b1d-778b-4bdc-b1f1-3b8ff484ad13', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'large-print', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('d8ee1a44-a7d8-4e8c-a2dc-aba21d4f96ef', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Image Cover', 'Text-first program with an authorized image-cover metadata slot.', 'PUBLISHED', 'c50ffda5-75e0-42fe-b4e0-ba6810746970', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'image-cover', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template VALUES ('146fa750-4c21-4400-ad78-15580775d639', 'SYSTEM', NULL, 'SACRAMENT_PROGRAM', 'Announcement Focus', 'Program layout that gives approved announcements clear emphasis.', 'PUBLISHED', '13123901-3b98-449d-8b29-fb378a2452a9', NULL, '2026-09-22 17:55:03.935135-07', '2026-09-22 17:55:03.935135-07', 'announcement-focus', 'DUPLICATE_AND_CUSTOMIZE', NULL, NULL, NULL, '2026-09-22 17:55:03.935135-07');


--
-- Data for Name: document_template_version; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.document_template_version VALUES ('99166a17-d71d-4d95-8d17-6fd0f24f6ca8', '2c4d5931-0f6a-4dc6-9572-ce98397f2039', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "BIFOLD", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Classic Bifold"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Classic Bifold", "coverMode": "NONE", "builtInKey": "classic-bifold", "description": "Traditional folded program with a balanced reading order.", "legacyPreset": "SINGLE_SHEET_BIFOLD", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('b706cee2-84f2-4408-a9ef-ae7bb78c5623', '072e2017-45df-46ac-bd2d-2da49d5f3a4e', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "TRIFOLD", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Trifold Bulletin"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Trifold Bulletin", "coverMode": "NONE", "builtInKey": "trifold-bulletin", "description": "Compact three-panel bulletin layout.", "legacyPreset": "TRI_FOLD_BULLETIN", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('78991541-c4b1-4ed3-b2b3-8b79cc0aac40', 'dac04293-211e-451b-96b7-8a11b0ce007d', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Full Page Standard"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Full Page Standard", "coverMode": "NONE", "builtInKey": "full-page-standard", "description": "Readable single-page program for digital and print use.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('8837a8c5-d6c6-4e7b-bbce-ca847cb5b0c7', 'f336f12f-55b6-4a80-9b97-79a506b47c77', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Modern Minimal"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Modern Minimal", "coverMode": "NONE", "builtInKey": "modern-minimal", "description": "Clean text-first layout with restrained visual hierarchy.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('e4858b93-7778-48e4-ab2f-053cbd7422a0', '73f93d25-52ab-4fba-b6fa-1b277a4cfd0d', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Compact One Page"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Compact One Page", "coverMode": "NONE", "builtInKey": "compact-one-page", "description": "Dense one-page format for shorter programs.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('9dd26b1d-778b-4bdc-b1f1-3b8ff484ad13', 'c74015e2-81e0-40ad-bdab-4e29340eb094', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Large Print"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Large Print", "coverMode": "NONE", "builtInKey": "large-print", "description": "Simplified layout intended for comfortable reading.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('c50ffda5-75e0-42fe-b4e0-ba6810746970', 'd8ee1a44-a7d8-4e8c-a2dc-aba21d4f96ef', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Image Cover"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Image Cover", "coverMode": "AUTHORIZED_IMAGE", "builtInKey": "image-cover", "description": "Text-first program with an authorized image-cover metadata slot.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');
INSERT INTO public.document_template_version VALUES ('13123901-3b98-449d-8b29-fb378a2452a9', '146fa750-4c21-4400-ad78-15580775d639', 1, 1, '{"id": "00000000-0000-4000-8000-000000000001", "fold": "NONE", "pages": [{"id": "00000000-0000-4000-8000-000000000002", "regions": [{"id": "00000000-0000-4000-8000-000000000003", "ratio": 1, "blocks": [{"id": "00000000-0000-4000-8000-000000000011", "type": "DOCUMENT_TITLE", "width": "FULL", "config": {"text": "Announcement Focus"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000012", "type": "WARD_NAME", "width": "FULL", "config": {"text": "Ward"}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000013", "type": "MEETING_INFO", "width": "FULL", "config": {"includeDate": true, "includeTime": true, "includeLocation": true}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000014", "type": "MEETING_PROGRAM", "width": "FULL", "config": {"items": []}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000015", "type": "ANNOUNCEMENTS", "width": "FULL", "config": {"text": ""}, "dataMode": "AUTO", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}, {"id": "00000000-0000-4000-8000-000000000016", "type": "QR_CODE", "width": "FULL", "config": {"href": "https://example.com", "label": "Open digital program"}, "dataMode": "MANUAL", "visibility": "VISIBLE", "printBehavior": "PRINT_AND_DIGITAL", "digitalBehavior": "NORMAL"}], "gutter": 0}]}], "paper": "LETTER", "theme": {"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}, "metadata": {"name": "Announcement Focus", "coverMode": "NONE", "builtInKey": "announcement-focus", "description": "Program layout that gives approved announcements clear emphasis.", "legacyPreset": "FULL_PAGE", "announcementMode": "AFTER_PROGRAM"}, "orientation": "PORTRAIT", "documentType": "SACRAMENT_PROGRAM", "schemaVersion": 1}', '{"fontFamily": "SYSTEM_SANS", "accentColor": "#1f2937", "baseFontSize": 12}', '{}', NULL, '2026-09-22 17:55:03.935135-07');


--
-- Data for Name: event_outbox; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: global_event_outbox; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: global_notification_delivery; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: global_user_notification; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: historical_import_name_review; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: hymn; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.hymn VALUES ('82cdd64b-a515-4c3b-a4f2-ec9ae8d7a160', '1', 'The Morning Breaks', 'STANDARD', 1, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6a251cc0-5e31-4d04-a4b8-3d5eba705922', '2', 'The Spirit of God', 'STANDARD', 2, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f0b70bb0-4608-4aae-81e4-ea3355098460', '3', 'Now Let Us Rejoice', 'STANDARD', 3, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('4347fa7b-1968-4199-bb3a-d7e0dc1e718f', '4', 'Truth Eternal', 'STANDARD', 4, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f4c1bdc0-bdf1-44af-9556-ebec8615832a', '5', 'High on the Mountain Top', 'STANDARD', 5, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('17fe1478-54af-498d-bef9-368c1c5ca20e', '6', 'Redeemer of Israel', 'STANDARD', 6, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a52e5af9-0d3c-4c88-8569-cf99ccd70b80', '7', 'Israel, Israel, God Is Calling', 'STANDARD', 7, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('fe61685c-2207-4bcd-9b6f-1beef3142e19', '8', 'Awake and Arise', 'STANDARD', 8, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7ce2261b-ca3f-4685-a6ed-c3910fe2d144', '9', 'Come, Rejoice', 'STANDARD', 9, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f7b46d43-171a-4a1c-865d-70c51074a3a5', '10', 'Come, Sing to the Lord', 'STANDARD', 10, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('bb99d54a-bd9a-45ab-9541-22e7983e8f03', '11', 'What Was Witnessed in the Heavens?', 'STANDARD', 11, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('64094def-bf47-494d-a7f8-0b5932ffccb8', '13', 'An Angel from on High', 'STANDARD', 13, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('446c3955-86ae-4ce3-b2e2-f63b1467979f', '15', 'I Saw a Mighty Angel Fly', 'STANDARD', 15, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e8a8b9ca-17cf-41d9-bb88-1891b0310c30', '16', 'What Glorious Scenes Mine Eyes Behold', 'STANDARD', 16, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8af59579-7068-421a-8be3-2d780b44418f', '17', 'Awake, Ye Saints of God, Awake!', 'STANDARD', 17, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0fd3264c-aa78-405f-a99e-3b34a972cd58', '18', 'The Voice of God Again Is Heard', 'STANDARD', 18, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('1caabe0e-8d47-40fe-b194-7f07e2348a1b', '19', 'We Thank Thee, O God, for a Prophet', 'STANDARD', 19, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('13674fdf-cb09-4cb3-9f28-aa4dca54c079', '20', 'God of Power, God of Right', 'STANDARD', 20, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('bc52abc8-0a1b-4fa3-9605-6d4d31440fa0', '21', 'Come, Listen to a Prophet''s Voice', 'STANDARD', 21, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d764a306-61a4-4d13-8eb3-08379d75745a', '22', 'We Listen to a Prophet''s Voice', 'STANDARD', 22, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c711c39c-48b8-489b-8a48-af429c3dc393', '23', 'We Ever Pray for Thee', 'STANDARD', 23, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d7a30942-82f6-4cf2-beeb-742d02ecedd0', '24', 'God Bless Our Prophet Dear', 'STANDARD', 24, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('08949d90-753e-4a53-8908-0c7d7d589bb5', '25', 'Now We''ll Sing with One Accord', 'STANDARD', 25, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ca1bf67d-1a8a-49b9-aba3-da9985ca3b79', '26', 'Joseph Smith''s First Prayer', 'STANDARD', 26, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('040d27d1-6d70-4c42-ab62-fa1dba3458fd', '27', 'Praise to the Man', 'STANDARD', 27, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('1869ab1a-8c51-4d92-bd21-1ebaa7950f50', '28', 'Saints, Behold How Great Jehovah', 'STANDARD', 28, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9f3672c3-72cc-4044-98ec-868ca23596f6', '29', 'A Poor Wayfaring Man of Grief', 'STANDARD', 29, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('418edace-1b54-4975-88d5-06d81c8c450b', '30', 'Come, Come, Ye Saints', 'STANDARD', 30, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('91048fcc-0b61-4c0e-bff5-c1de941bc2e4', '31', 'O God, Our Help in Ages Past', 'STANDARD', 31, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('234c6f20-5657-4804-95fc-dd48aae17068', '32', 'The Happy Day at Last Has Come', 'STANDARD', 32, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f4d10779-e3bd-454d-9d01-548173853476', '33', 'Our Mountain Home So Dear', 'STANDARD', 33, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('30d3ab0c-b08e-47c7-a679-c5a3d316ab35', '34', 'O Ye Mountains High', 'STANDARD', 34, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c87c66b1-d24f-4aa8-91d0-5c2f25f268f4', '35', 'For the Strength of the Hills', 'STANDARD', 35, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('84918d04-9371-43ee-8a6a-9f3b47bf59e4', '36', 'They, the Builders of the Nation', 'STANDARD', 36, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9f2da897-dd3a-4d59-bfa9-5fe5e12e99f2', '37', 'The Wintry Day, Descending to Its Close', 'STANDARD', 37, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('373777dc-dbfa-406b-a1c4-5b5887a61514', '40', 'Arise, O Glorious Zion', 'STANDARD', 40, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a6b65477-6fd4-4431-b8cd-14cb06fcee40', '41', 'Let Zion in Her Beauty Rise', 'STANDARD', 41, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6b07a7c4-1be2-4da5-9e11-99ef4fd4c6b7', '42', 'Hail to the Brightness of Zion''s Glad Morning!', 'STANDARD', 42, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('46ce9d3c-44b4-4a39-a6e2-39b908d2eae5', '43', 'Zion Stands with Hills Surrounded', 'STANDARD', 43, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5c476682-4142-4d7f-83e7-7908c4aaf655', '44', 'Beautiful Zion, Built Above', 'STANDARD', 44, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('1518cbbf-94ac-4f8f-8bd7-117723af8bbd', '46', 'Glorious Things of Thee Are Spoken', 'STANDARD', 46, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6583c851-1985-466e-95e8-f89eedf01139', '47', 'We Will Sing of Zion', 'STANDARD', 47, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('31f6bacf-8ae2-4dc8-9f25-50c08f951c9f', '48', 'Glorious Things Are Sung of Zion', 'STANDARD', 48, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a645f00d-1a4a-4020-a870-0b582b9ec365', '49', 'Adam-ondi-Ahman', 'STANDARD', 49, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('56d86e68-1dec-4803-bd9f-0ee27479b69d', '51', 'Sons of Michael, He Approaches', 'STANDARD', 51, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3b311647-9029-4011-92b6-252d0cdc52a1', '53', 'Let Earth''s Inhabitants Rejoice', 'STANDARD', 53, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6e6de130-e56b-4085-aefa-b0343a6818f6', '55', 'Lo, the Mighty God Appearing!', 'STANDARD', 55, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2a3c1676-36e9-44d9-a9c2-9c106b9129ef', '56', 'Softly Beams the Sacred Dawning', 'STANDARD', 56, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8a1802c7-1be2-40af-8e5c-bebd2bddde73', '57', 'We''re Not Ashamed to Own Our Lord', 'STANDARD', 57, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('cb7da68d-6fea-4ff2-9df3-4d1b580efe9f', '58', 'Come, Ye Children of the Lord', 'STANDARD', 58, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('69d88851-12da-447a-b967-aa87edf6f507', '59', 'Come, O Thou King of Kings', 'STANDARD', 59, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('cc0a7504-5e60-4728-a563-27732e40f657', '60', 'Battle Hymn of the Republic', 'STANDARD', 60, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('69c73f68-d84d-4750-a7b6-9753f566a7c9', '61', 'Raise Your Voices to the Lord', 'STANDARD', 61, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a4176cbb-51fa-46dd-b7d8-11caa70bfd3a', '62', 'All Creatures of Our God and King', 'STANDARD', 62, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c9dc2cb3-0e9e-4862-b020-4b553b1f1986', '63', 'Great King of Heaven', 'STANDARD', 63, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d9a7bbe1-3bdc-41d2-9882-d6a629b065c8', '64', 'On This Day of Joy and Gladness', 'STANDARD', 64, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('452aba03-65b3-4135-85a7-fcb66328d133', '65', 'Come, All Ye Saints Who Dwell on Earth', 'STANDARD', 65, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2e5a9cd2-5cbf-4d09-adb2-caff7d6d61ee', '66', 'Rejoice, the Lord Is King!', 'STANDARD', 66, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('be96a317-8f33-4977-8e49-0ff1ec47c5d4', '67', 'Glory to God on High', 'STANDARD', 67, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('31c8763c-f056-4964-9169-95c90e515536', '68', 'A Mighty Fortress Is Our God', 'STANDARD', 68, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('14ab1df6-cdea-492d-8e12-57acc426cbb4', '69', 'All Glory, Laud, and Honor', 'STANDARD', 69, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f3a3b7a4-e254-429a-b89e-aa18d437d876', '71', 'With Songs of Praise', 'STANDARD', 71, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('99374867-cef7-45f0-a0ed-fcc4e346b2fe', '72', 'Praise to the Lord, the Almighty', 'STANDARD', 72, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('74d73bec-9c4e-43da-8e18-944991b1ed8d', '73', 'Praise the Lord with Heart and Voice', 'STANDARD', 73, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('acede243-aa2c-46a2-a554-7743e7259eef', '75', 'In Hymns of Praise', 'STANDARD', 75, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d50902e4-0764-43b3-878c-8adb2f5a5e9a', '76', 'God of Our Fathers, We Come unto Thee', 'STANDARD', 76, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a9ea941d-4322-4edc-8813-9052db63eb8c', '77', 'Great Is the Lord', 'STANDARD', 77, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5a9aad44-e256-41ab-9791-eb4c2c115397', '79', 'With All the Power of Heart and Tongue', 'STANDARD', 79, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('fc586966-7bda-47bb-8e0e-9cdbd2388929', '81', 'Press Forward, Saints', 'STANDARD', 81, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c83a4d70-7c2e-4d11-b670-75da3cecab90', '82', 'For All the Saints', 'STANDARD', 82, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e7bcb305-a926-4d5e-98b2-d7da01cab4be', '83', 'Guide Us, O Thou Great Jehovah', 'STANDARD', 83, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a02512a9-9331-41af-93d3-dbff25c37bda', '84', 'Faith of Our Fathers', 'STANDARD', 84, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('45dc6d1a-4514-4038-a187-e0a6ed8805c9', '85', 'How Firm a Foundation', 'STANDARD', 85, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e911c4e7-fbc7-4a9b-910d-4ecfe0061b72', '86', 'How Great Thou Art', 'STANDARD', 86, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ce1e7234-bc2b-4769-806e-244ee8e4c814', '87', 'God Is Love', 'STANDARD', 87, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8b8f4ab4-0d6c-42b3-b10b-b0edce64734c', '90', 'From All That Dwell below the Skies', 'STANDARD', 90, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a1a1dc7f-c3ab-4565-948b-bb26632e6396', '91', 'Father, Thy Children to Thee Now Raise', 'STANDARD', 91, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3462223e-0250-450f-a508-0545565105ea', '92', 'For the Beauty of the Earth', 'STANDARD', 92, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('52a4a660-e222-455c-b81f-0f598717c1ae', '93', 'Prayer of Thanksgiving', 'STANDARD', 93, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('1a7ec426-97d4-414d-8e8e-850d303ef471', '94', 'Come, Ye Thankful People', 'STANDARD', 94, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7f8f4376-6f10-4261-86e0-a1fd21b6132c', '95', 'Now Thank We All Our God', 'STANDARD', 95, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f317abf0-ff4a-4708-992b-5ceef6bc6728', '96', 'Dearest Children, God Is Near You', 'STANDARD', 96, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e3926960-b924-494f-abc6-5dd5d3cbfcd6', '98', 'I Need Thee Every Hour', 'STANDARD', 98, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5b549fd6-bb38-4438-8e40-eb11fd3905e9', '99', 'Nearer, Dear Savior, to Thee', 'STANDARD', 99, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a759b139-856a-4ea8-b887-ffe9711ebdb9', '100', 'Nearer, My God, to Thee', 'STANDARD', 100, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('65c62fe4-afe7-42bb-baa6-e86d0659d372', '101', 'Guide Me to Thee', 'STANDARD', 101, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('43db6e18-2d76-4e7a-ab73-4a3ad7b7402d', '102', 'Jesus, Lover of My Soul', 'STANDARD', 102, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d0292a84-4ce4-4a22-91e1-6aec7b9d8db0', '103', 'Precious Savior, Dear Redeemer', 'STANDARD', 103, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6666a1d7-a0bf-4afd-8523-a8669f6abbb8', '105', 'Master, the Tempest Is Raging', 'STANDARD', 105, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ce31d594-850e-4d95-b03a-b0455ceeb641', '106', 'God Speed the Right', 'STANDARD', 106, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7120b4cd-f828-4409-aa42-fedaa92d6406', '107', 'Lord, Accept Our True Devotion', 'STANDARD', 107, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8fd4d1e5-5d30-4159-b022-8e9c53c28b68', '109', 'The Lord My Pasture Will Prepare', 'STANDARD', 109, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('47876076-52ac-4870-ba4c-2e7f574512fa', '110', 'Cast Thy Burden upon the Lord', 'STANDARD', 110, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3b7e294f-8172-46b3-b1cb-47db4c75cd16', '111', 'Rock of Ages', 'STANDARD', 111, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('cc19c5c5-6a48-4e6f-bce1-7488cad573f8', '112', 'Savior, Redeemer of My Soul', 'STANDARD', 112, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5e6b8fe1-68f8-43f9-b57f-dc79e437289a', '113', 'Our Savior''s Love', 'STANDARD', 113, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d4e5a2a7-52e2-4e0b-a469-88caeca117fc', '114', 'Come unto Him', 'STANDARD', 114, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('05e2eaaf-46b0-45f8-95c6-dfec03e31084', '115', 'Come, Ye Disconsolate', 'STANDARD', 115, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d3524fec-c5aa-4d1b-8d05-8aa84e4120ac', '116', 'Come, Follow Me', 'STANDARD', 116, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f5ccfb97-d4bf-4e07-aa79-9cff874bbfbb', '117', 'Come unto Jesus', 'STANDARD', 117, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0e731ec4-b860-498f-8758-310dfc87803f', '118', 'Ye Simple Souls Who Stray', 'STANDARD', 118, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3e4a467b-f5e4-4e0b-bc84-88e014d57f9f', '119', 'Come, We That Love the Lord', 'STANDARD', 119, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c83df33d-4973-4ac6-843d-5e6a925155d5', '120', 'Lean on My Ample Arm', 'STANDARD', 120, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e18c5fcb-3026-4557-8875-d01b8f81ec35', '121', 'I''m a Pilgrim, I''m a Stranger', 'STANDARD', 121, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e2549e05-92f3-4a4c-b99e-d9c52e359311', '124', 'Be Still, My Soul', 'STANDARD', 124, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8827badc-81d6-4f6d-b822-bb12c225be8b', '125', 'How Gentle God''s Commands', 'STANDARD', 125, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2bf81a70-09a9-4ba9-82ff-cb4d3dc35b29', '126', 'How Long, O Lord Most Holy and True', 'STANDARD', 126, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0bac981b-9297-43bf-8f9c-ee225b768335', '127', 'Does the Journey Seem Long?', 'STANDARD', 127, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6b65c91e-0e6d-4662-8ea6-e12b51c1cf02', '128', 'When Faith Endures', 'STANDARD', 128, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b541bca0-fd49-416b-aa69-a67dac0d750a', '129', 'Where Can I Turn for Peace?', 'STANDARD', 129, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('066c83c6-6bb0-4c3d-8f90-c54670a82d46', '130', 'Be Thou Humble', 'STANDARD', 130, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('37799b72-5335-49ed-a2da-c4d2b8166d60', '131', 'More Holiness Give Me', 'STANDARD', 131, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5871c9ee-8b47-4b5e-9a7f-602c1fcd1c5a', '132', 'God Is in His Holy Temple', 'STANDARD', 132, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9e068544-0aa6-4b95-8a65-4ec5dcb1a717', '133', 'Father in Heaven', 'STANDARD', 133, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0dd0e6a8-5396-4b88-9c37-cf99a106ba61', '134', 'I Believe in Christ', 'STANDARD', 134, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('41985fbb-f631-4955-8c29-2d160ab3df53', '135', 'My Redeemer Lives', 'STANDARD', 135, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('dc2189c9-516d-44c1-a686-16c223aefd8b', '136', 'I Know That My Redeemer Lives', 'STANDARD', 136, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3f775024-c61b-44ad-9037-f8580fe9781a', '137', 'Testimony', 'STANDARD', 137, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c23b9ccc-a014-4940-98b6-38deac4d390e', '138', 'Bless Our Fast, We Pray', 'STANDARD', 138, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('43949b38-d1ef-41b3-b05f-93462656ca72', '139', 'In Fasting We Approach Thee', 'STANDARD', 139, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('77f444ff-88a2-43a4-ae52-67b4d99e64ce', '140', 'Did You Think to Pray?', 'STANDARD', 140, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('77480c2b-cf17-482d-a76a-e7978e56d1c0', '74', 'Praise Ye the Lord', 'STANDARD', 74, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8ce891ec-8181-49b1-93d3-24193b97631a', '169', 'As Now We Take the Sacrament', 'STANDARD', 169, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d136e8cd-e05a-455b-be47-46e5910c4365', '172', 'In Humility, Our Savior', 'STANDARD', 172, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0ee3d887-90f5-4f0c-bc05-84f0d9237b10', '173', 'While of These Emblems We Partake', 'STANDARD', 173, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('33022357-775d-43e5-b823-18fdb040b34c', '175', 'O God, the Eternal Father', 'STANDARD', 175, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e6cf2c32-a239-483f-9837-1a512159d66f', '187', 'God Loved Us, So He Sent His Son', 'STANDARD', 187, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('4ec6360e-aa22-4471-9035-9db8f742b5ee', '193', 'I Stand All Amazed', 'STANDARD', 193, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('923a8779-7944-4dfd-ad71-228ddca0fb26', '199', 'He Is Risen!', 'STANDARD', 199, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('daa5b063-9708-4b2a-b3cb-48d472f91108', '219', 'Because I Have Been Given Much', 'STANDARD', 219, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('44f24a84-6fae-4679-8328-b735c23f1f81', '220', 'Lord, I Would Follow Thee', 'STANDARD', 220, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('98c2807e-cc59-4654-a785-75e0aa3a9743', '227', 'There Is Sunshine in My Soul Today', 'STANDARD', 227, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d2b56f81-1db5-40aa-ac4e-969b4bf85658', '237', 'Do What Is Right', 'STANDARD', 237, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6895ea20-39de-48a3-94b6-1a5aad7a2476', '241', 'Count Your Blessings', 'STANDARD', 241, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2aec83ca-9fcc-42b2-a642-fc82641372d7', '243', 'Let Us All Press On', 'STANDARD', 243, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e0e4a457-0601-4495-893f-93ca8314aa7f', '255', 'Carry On', 'STANDARD', 255, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ed60e3fd-39e2-4b8b-bf6d-a91e00a19766', '259', 'Hope of Israel', 'STANDARD', 259, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a16a576d-955e-40b6-93da-c7c23fffd5a7', '260', 'Who''s on the Lord''s Side?', 'STANDARD', 260, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7b82fe6a-ad75-43d2-b834-2af1a94b6530', '264', 'Hark, All Ye Nations!', 'STANDARD', 264, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('24239884-2f70-4932-baef-35db3009c2ba', '270', 'I''ll Go Where You Want Me to Go', 'STANDARD', 270, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ee9aaafe-301d-4b85-b125-1fdb332ef979', '292', 'O My Father', 'STANDARD', 292, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b7c0b739-bbbf-4f78-a2cd-c250a2a70852', '294', 'Love at Home', 'STANDARD', 294, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d16d5360-9471-49a9-b9dd-d5e5e1aca237', '301', 'I Am a Child of God', 'STANDARD', 301, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('44723c10-c0d9-441a-a819-24aeeb4b0661', '302', 'I Know My Father Lives', 'STANDARD', 302, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e1338cb4-502c-4aef-91a2-68874bdafa5d', '304', 'Teach Me to Walk in the Light', 'STANDARD', 304, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('941335fc-9970-442c-8f17-f2dc93ecfc13', '308', 'Love One Another', 'STANDARD', 308, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('148edea1-998b-4fd8-8517-547f4ba57009', '1001', 'Come, Thou Fount of Every Blessing', 'NEW', 1001, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('44be06bf-016d-450e-b8f7-bc5862f46135', '1002', 'When the Savior Comes Again', 'NEW', 1002, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3d5274cb-2831-4f4d-a5ef-bde0da986b32', '1003', 'It Is Well with My Soul', 'NEW', 1003, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c5ec0829-280a-4d45-8c2e-29d6f9f6a02a', '1004', 'I Will Walk with Jesus', 'NEW', 1004, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7b16a006-188c-46b8-8d07-5e98fdabfa0f', '1005', 'His Eye Is on the Sparrow', 'NEW', 1005, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('939fbc1f-f678-45b3-85b2-1a2468a96b25', '1006', 'Think a Sacred Song', 'NEW', 1006, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2813f862-b775-4769-b075-d92d631dab5c', '1007', 'As Bread Is Broken', 'NEW', 1007, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('574f1829-cbb3-4666-83c4-f11c539270d4', '1008', 'Bread of Life, Living Water', 'NEW', 1008, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('05cfbc05-fa0e-4edb-be1c-cbf24c6a7ace', '1009', 'Gethsemane', 'NEW', 1009, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e98755a8-4c46-485f-a46c-f03be661ec94', '1010', 'Amazing Grace', 'NEW', 1010, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ce2c490b-bd6b-4c89-b5dd-f978da828b80', '1011', 'Holding Hands Around the World', 'NEW', 1011, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('fd6ae0e5-0d25-445f-8790-dba64f60f72c', '1012', 'Anytime, Anywhere', 'NEW', 1012, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('be09b0ba-2f0f-4960-9c88-d02d19afb3af', '1013', 'God''s Gracious Love', 'NEW', 1013, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c0544990-90cd-441e-aabf-2dc88292c394', '1014', 'My Shepherd Will Supply My Need', 'NEW', 1014, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6142a895-fe7d-496f-9e75-464800a64b2f', '1015', 'Oh, the Deep, Deep Love of Jesus', 'NEW', 1015, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('84a4e54d-68ad-49b2-8860-a03f9b4a3dca', '1016', 'Behold the Wounds in Jesus'' Hands', 'NEW', 1016, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('255cdebc-8b01-4ddb-926a-a4881edcfe01', '1017', 'This Is the Christ', 'NEW', 1017, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ded9a3cf-e391-4920-b7a8-f0f0379a2529', '1018', 'Come, Lord Jesus', 'NEW', 1018, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0ebbabce-981f-45fb-8293-70d287befb6b', '1019', 'To Love like Thee', 'NEW', 1019, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3a354f5d-9870-4f51-95ef-56e35876d7ed', '1020', 'Softly and Tenderly Jesus Is Calling', 'NEW', 1020, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ccab4144-653c-47a4-aaad-3e3d7da53688', '1021', 'I Know That My Savior Loves Me', 'NEW', 1021, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0cf7b978-64dc-44b5-b37e-e0b6e5376166', '1022', 'Faith in Every Footstep', 'NEW', 1022, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d6087200-7665-4cfa-b304-99741d6e5b9c', '1023', 'Standing on the Promises', 'NEW', 1023, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3e25d55e-e8e8-4641-8be8-7d12039fef2e', '1024', 'I Have Faith in the Lord Jesus Christ', 'NEW', 1024, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c322f893-a9ad-41ea-a7d1-559635e3ee71', '1025', 'Take My Heart and Let It Be Consecrated', 'NEW', 1025, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b6607aeb-bc52-4b4a-a420-c100734e59d3', '1026', 'Holy Places', 'NEW', 1026, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('594a957d-8405-45e2-8f1e-d697084a9835', '1027', 'Welcome Home', 'NEW', 1027, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('def64264-23f7-4f2a-aa15-d58be1eadbe0', '1028', 'This Little Light of Mine', 'NEW', 1028, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ef5c44b2-62b9-46c2-a5b6-1d680e024b2b', '1029', 'I Can''t Count Them All', 'NEW', 1029, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0f6207a2-2889-4e63-b787-6b05919dbd19', '1030', 'Close as a Quiet Prayer', 'NEW', 1030, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('dee92f4c-9f1d-4e44-92cd-81628ce8776e', '1031', 'Come, Hear the Word the Lord Has Spoken', 'NEW', 1031, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d7a1bcd5-20d6-46ce-b0a3-a2aca811a277', '1032', 'Look unto Christ', 'NEW', 1032, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9681d8fc-d8b0-4f0b-a3b3-46dbeda7d408', '1033', 'Oh, How Great Is Our Joy', 'NEW', 1033, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('01d5b0c6-8fa1-4ae8-a48b-1596e6d32e37', '1034', 'I''m a Pioneer Too', 'NEW', 1034, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5fb6cad5-1bc1-4e95-a976-ff46d77a6199', '1035', 'As I Keep the Sabbath Day', 'NEW', 1035, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('af6176a0-e89b-482f-a040-8b31672a0699', '1036', 'Read the Book of Mormon and Pray', 'NEW', 1036, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c15a2978-bc6a-4a3b-a937-d9be4e9a776a', '1037', 'I''m Gonna Live So God Can Use Me', 'NEW', 1037, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('253e8210-1710-4c26-ba5e-c1f2df5c6dce', '1038', 'The Lord''s My Shepherd', 'NEW', 1038, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b050c069-4940-4aa4-a90a-bfcdc5005e1a', '1039', 'Because', 'NEW', 1039, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('fd740a56-e9f4-4362-9165-de84dc0e2cd4', '1040', 'His Voice as the Sound', 'NEW', 1040, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('1f09a195-59a6-4d97-a438-1146952659e9', '1041', 'O Lord, Who Gave Thy Life for Me', 'NEW', 1041, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('058682bb-0632-4163-be93-eedd5fe8f839', '1042', 'Thou Gracious God, Whose Mercy Lends', 'NEW', 1042, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('fd7093a0-68cf-493c-b495-faa7ba94a6a9', '1043', 'Help Us Remember', 'NEW', 1043, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e26e1ac1-dcaa-4dda-87cd-ae56c330b8e9', '1044', 'How Did The Savior Minister', 'NEW', 1044, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('dd9f37b1-e29a-47e4-a6c7-db42b09eba9b', '1045', 'Jesus Is the Way', 'NEW', 1045, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8afd8ddf-d216-4b81-8ac9-1d1b57f44ac0', '1046', 'Can You Count the Stars in Heaven?', 'NEW', 1046, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b91a061f-3554-4d6e-beb2-0c5ee880210a', '1047', 'He Cares for Me', 'NEW', 1047, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('0513e06a-1780-4ca5-a90b-9bfda1c15279', '1048', 'Our Prayer to Thee', 'NEW', 1048, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d858cb2c-0d60-4276-87da-8cf5fdbc54ca', '1049', 'Joseph Prayed in Faith', 'NEW', 1049, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('00bed64b-017d-4bec-8898-fbffd26d55d1', '1050', 'Stand by Me', 'NEW', 1050, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('847e35e4-07df-44ad-b949-fd5b2008de5e', '1051', 'This Day Is a Good Day, Lord', 'NEW', 1051, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7d83f0f3-ceb1-4185-8a08-2985efbdf139', '1201', 'Hail the Day that Sees Him Rise', 'NEW', 1201, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('cfe9f2af-6f18-4c43-b89b-b3f27e615373', '1202', 'He Is Born, the Divine Christ Child', 'NEW', 1202, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('70e8bbd0-0a21-45d1-93ea-976f3450214b', '1203', 'What Child Is This?', 'NEW', 1203, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('029f0161-ab9e-438c-ac25-e678dac55b57', '1204', 'Star Bright', 'NEW', 1204, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9d096c1f-2c62-40ac-986e-619aea4d899b', '1205', 'Let Easter Anthems Ring', 'NEW', 1205, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('af8af9a7-e947-4bde-8856-3b91f6391143', '1206', 'Were You There?', 'NEW', 1206, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('b1753828-6d9f-4146-bc50-d5ffad144c6f', '1207', 'Still, Still, Still', 'NEW', 1207, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5043c514-4d99-4402-948c-ab3315e3082b', '1208', 'Go Tell It on the Mountain', 'NEW', 1208, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('afbc712d-c186-45fe-b58b-fbe84be05a31', '1209', 'Little Baby in a Manger', 'NEW', 1209, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ece02418-2fa8-4ee2-94d5-472f07e437f4', 'C1', 'I Am a Child of God', 'CHILDRENS', 20001, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('9443f245-9bfe-4acc-9ebe-e7af60c14889', 'C2', 'A Child''s Prayer', 'CHILDRENS', 20002, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7867f2b2-8046-437f-8da9-19a26963eaa6', 'C3', 'Families Can Be Together Forever', 'CHILDRENS', 20003, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('21e8957a-bd49-4ea3-8ddd-58a366485de9', 'C4', 'Follow the Prophet', 'CHILDRENS', 20004, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('3645537b-9570-452c-a5ac-e1f13534b303', 'C5', 'I Love to See the Temple', 'CHILDRENS', 20005, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8a0c854b-1f86-42c7-a11b-9cacad0ff574', 'C6', 'Book of Mormon Stories', 'CHILDRENS', 20006, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('746e78d3-442a-41d1-add8-3aed7cb36f96', 'C7', 'Jesus Wants Me for a Sunbeam', 'CHILDRENS', 20007, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('65d7f230-fdca-4d25-90c0-0713595db2ce', 'C8', 'Tell Me the Stories of Jesus', 'CHILDRENS', 20008, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5fb72a7f-98d1-4faf-b0ef-f1431eaf2820', 'C9', 'I Hope They Call Me on a Mission', 'CHILDRENS', 20009, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c40ca569-7378-4e66-b202-52fdd5d3c9e9', 'C10', 'Teach Me to Walk in the Light', 'CHILDRENS', 20010, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('790e596d-b8be-4b11-aef2-570d1982c0fb', 'C11', 'My Heavenly Father Loves Me', 'CHILDRENS', 20011, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e183fa86-da6e-42f3-a393-e0f261440bcc', 'C12', 'Love One Another', 'CHILDRENS', 20012, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('224a41d5-2919-405a-9800-24d3b8377f95', 'C13', 'The Church of Jesus Christ', 'CHILDRENS', 20013, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d72d7e3f-1c0a-4b24-a3fd-e8386e833a7e', 'C14', 'When He Comes Again', 'CHILDRENS', 20014, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('31d4e41c-0532-4123-b887-fe6372f10549', 'C15', 'He Sent His Son', 'CHILDRENS', 20015, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e3be8445-04a8-42fa-9eaf-aa4a3fd8f5d6', 'C16', 'I''m Trying to Be like Jesus', 'CHILDRENS', 20016, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('bbd090f3-f3b0-4d40-9909-d59490b259f3', 'C17', 'Search, Ponder, and Pray', 'CHILDRENS', 20017, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('867b3f7d-d3df-472e-b5aa-2a8a8a7719ba', 'C18', 'Keep the Commandments', 'CHILDRENS', 20018, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e9441438-8697-4673-9b77-220b94a03f39', 'C19', 'Saturday', 'CHILDRENS', 20019, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('096efcdb-5f7c-4289-9489-7ed926b11a03', 'C20', 'Dare to Do Right', 'CHILDRENS', 20020, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('760f4932-5674-44ba-ace6-fbe8c981855f', 'C21', 'Stand for the Right', 'CHILDRENS', 20021, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('386053cf-d979-48c2-8a09-4d65abf0ee1c', 'C22', 'Little Pioneer Children', 'CHILDRENS', 20022, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('86db80a4-5117-465b-a286-dd6bbaf6ec71', 'C23', 'Quickly I''ll Obey', 'CHILDRENS', 20023, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f43683b4-2141-4771-bd65-06a5590fe0d9', 'C24', 'We''ll Bring the World His Truth', 'CHILDRENS', 20024, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('f87c1e5b-e15c-497b-a0e3-196bff2bb5b5', 'C25', 'Popcorn Popping', 'CHILDRENS', 20025, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('d5bbd7ba-6eec-4c07-b1ba-ddc88e42c764', 'C26', 'Once There Was a Snowman', 'CHILDRENS', 20026, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('32c0a5e9-9049-4f43-86a0-48e01ffdce05', 'C27', 'Love Is Spoken Here', 'CHILDRENS', 20027, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('8ac73f14-3dbe-4e17-b6a4-40fde7ad2a0a', 'C28', 'I Know My Father Lives', 'CHILDRENS', 20028, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('6d45d38f-fc15-4635-a507-e1e1e2c994e9', 'C29', 'To Be a Pioneer', 'CHILDRENS', 20029, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('460d48ba-f02c-4c3a-8b75-850fec85aea7', 'C30', 'Do As I''m Doing', 'CHILDRENS', 20030, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('872db359-3df4-4271-8c75-6c5da82b6df4', 'C31', 'Jesus Said Love Everyone', 'CHILDRENS', 20031, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a424316f-f53f-402c-94d7-837c44ccefbe', 'C32', 'Give Said the Little Stream', 'CHILDRENS', 20032, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('e932f724-202e-4e21-825f-7377407de164', 'C33', 'Smiles', 'CHILDRENS', 20033, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c62cdeb7-35c8-40a4-9ac4-efecbdb0f5b3', 'C34', 'The Wise Man and the Foolish Man', 'CHILDRENS', 20034, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5d60be1e-3b51-4758-8d8a-a27d22603034', 'C35', 'Choose the Right Way', 'CHILDRENS', 20035, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('53d3afec-1232-4d08-977b-9a20fbba621e', 'C36', 'I Lived in Heaven', 'CHILDRENS', 20036, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ef8ff721-3ddf-41bf-a794-d0282090a567', 'C37', 'Before I Take the Sacrament', 'CHILDRENS', 20037, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('83ccb212-964e-48b0-854d-0bf28706641b', 'C38', 'Reverently, Quietly', 'CHILDRENS', 20038, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('5f5d64db-6622-4fb3-b811-34048bd928b2', 'C39', 'The Lord Gave Me a Temple', 'CHILDRENS', 20039, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('76199615-22a9-45de-a268-31ec32fab428', 'C40', 'On a Golden Springtime', 'CHILDRENS', 20040, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('ab0186b5-e0a3-444a-b6b4-b9b31bc96de3', 'C41', 'When I Am Baptized', 'CHILDRENS', 20041, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('20bd2a4a-d9f2-4d76-be62-84740abe72d8', 'C42', 'Head, Shoulders, Knees, and Toes', 'CHILDRENS', 20042, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('44652998-a0e8-4f28-b6ae-1c8d7948d861', 'C43', 'If You''re Happy', 'CHILDRENS', 20043, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('499d07b3-49e8-4e8b-bd42-a9463e3f0c9e', 'C44', 'If I Listen with My Heart', 'CHILDRENS', 20044, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('97a13bc9-6bee-439e-ac2c-b940ee57a392', 'C45', 'Called to Serve', 'CHILDRENS', 20045, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('a3688693-d5ce-4466-b868-ad13d2e3a7ba', 'C46', 'The Holy Ghost', 'CHILDRENS', 20046, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('7c51359d-582c-42e5-b6f1-1c5c0417908d', 'C47', 'I Feel My Savior''s Love', 'CHILDRENS', 20047, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('c5788fba-c49b-4a8c-bd48-a9664beb6e48', 'C48', 'I Wonder When He Comes Again', 'CHILDRENS', 20048, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('11c4f04c-cf3e-4a62-a4ed-6fe40e14e036', 'C49', 'The Sacrament', 'CHILDRENS', 20049, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('88a586f8-0039-40d5-b8ca-6624c75101ac', 'C50', 'Baptism', 'CHILDRENS', 20050, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.255312-07');
INSERT INTO public.hymn VALUES ('2d2072e2-a467-4874-9629-2e79df7e6cd5', '12', '''Twas Witnessed in the Morning Sky', 'STANDARD', 12, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e27ae7c8-a240-40b3-8cd4-6cb6847f2312', '14', 'Sweet Is the Peace the Gospel Brings', 'STANDARD', 14, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a798f32e-9382-4948-ba1c-96941f7fd0c6', '38', 'Come, All Ye Saints of Zion', 'STANDARD', 38, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('58851970-0bd6-48b9-89df-06f1a3b78820', '39', 'O Saints of Zion', 'STANDARD', 39, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('3ec94f05-9b51-4824-a0c9-11e95f0ea699', '45', 'Lead Me into Life Eternal', 'STANDARD', 45, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('28e69d5e-2998-479c-a100-0c0b07526f31', '50', 'Come, Thou Glorious Day of Promise', 'STANDARD', 50, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b22f8c37-6e58-40de-b359-273a48c6f1c2', '52', 'The Day Dawn Is Breaking', 'STANDARD', 52, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9afb4b39-f503-4ef2-a74f-be5dc9122d2e', '54', 'Behold, the Mountain of the Lord', 'STANDARD', 54, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('6b473c14-0e3a-4080-9555-8eb4b6d09740', '70', 'Sing Praise to Him', 'STANDARD', 70, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('6de30054-9d45-4e05-8b89-301ea7d006a7', '78', 'God of Our Fathers, Whose Almighty Hand', 'STANDARD', 78, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d27564bb-9531-47fb-8c8a-231215433ed8', '80', 'God of Our Fathers, Known of Old', 'STANDARD', 80, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2e146399-9914-4348-bdd5-6cef1e63f8e4', '88', 'Great God, Attend While Zion Sings', 'STANDARD', 88, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e6815a6b-d481-4af7-9a19-4ade5d826581', '89', 'The Lord Is My Light', 'STANDARD', 89, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('23ca1525-eb93-419c-990e-b3d42a8d70fb', '97', 'Lead, Kindly Light', 'STANDARD', 97, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e50a5f60-eabb-43d0-915d-d8eaff5c8114', '104', 'Jesus, Savior, Pilot Me', 'STANDARD', 104, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('34a216fb-5402-4ba7-8014-c28dd47abb2f', '108', 'The Lord Is My Shepherd', 'STANDARD', 108, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('0fa094a7-a0ee-42db-86d0-dc6cc3cd4a1d', '122', 'Though Deepening Trials', 'STANDARD', 122, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('7e20aa15-9405-46f0-9ee0-63c9b437068d', '123', 'Oh, May My Soul Commune with Thee', 'STANDARD', 123, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2b159d4e-9d23-4d5f-9c88-6277f73d4930', '141', 'Jesus, the Very Thought of Thee', 'STANDARD', 141, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('61447201-107d-426e-9429-2220cdf60274', '142', 'Sweet Hour of Prayer', 'STANDARD', 142, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('be9b2aa1-0f11-4815-9d33-e90b3a2a0495', '143', 'Let the Holy Spirit Guide', 'STANDARD', 143, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('dd48e0fe-85c7-4993-b13c-79e615a639f6', '144', 'Secret Prayer', 'STANDARD', 144, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('f58e34b5-8fdc-4105-96ed-8edf2f53afcb', '145', 'Prayer Is the Soul''s Sincere Desire', 'STANDARD', 145, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a19f281c-8e3e-4d56-b789-4eb76dc83934', '146', 'Gently Raise the Sacred Strain', 'STANDARD', 146, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('6970c484-453b-4d81-bcc1-ef6d34ec31d1', '147', 'Sweet Is the Work', 'STANDARD', 147, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('60ca68d3-e2b9-4707-bc1f-b4621e11d726', '148', 'Sabbath Day', 'STANDARD', 148, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('7ae0c253-5c25-49c7-881e-8d41cee658e3', '149', 'As the Dew from Heaven Distilling', 'STANDARD', 149, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('412b6445-a324-4cf0-b107-b1f7fe2dcd42', '150', 'O Thou Kind and Gracious Father', 'STANDARD', 150, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('c7311811-add4-4b56-a4b3-ae896fefdc3c', '151', 'We Meet, Dear Lord', 'STANDARD', 151, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4c6b0c3c-917c-4aa5-ac0f-0340dda4b8cc', '152', 'God Be with You Till We Meet Again', 'STANDARD', 152, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b7e82f56-f2c4-49ff-a3f7-523c70a4f2fe', '153', 'Lord, We Ask Thee Ere We Part', 'STANDARD', 153, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8f4c56d1-40ba-4688-96d6-df9b36bfbd0b', '223', 'Have I Done Any Good?', 'STANDARD', 223, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('424f0f95-59fa-489b-8612-d9b89b1a3ff7', '245', 'This House We Dedicate to Thee', 'STANDARD', 245, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('543757a9-a5cb-4ea8-891c-c8576bf10cb6', '247', 'We Love Thy House, O God', 'STANDARD', 247, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a63121e9-483c-475f-8f1f-4f597a5fe6cc', '284', 'If You Could Hie to Kolob', 'STANDARD', 284, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e93091c9-65af-4b6d-9d3a-bb3be5fda25d', '309', 'As Sisters in Zion (Women)', 'STANDARD', 309, true, '2026-09-22 17:55:03.255312-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('912eca6c-de25-4fe8-84cc-3b4c2418de42', '154', 'Father, This Hour Has Been One of Joy', 'STANDARD', 154, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e67f8e8f-823d-425f-8021-0f37af2a9bb9', '155', 'We Have Partaken of Thy Love', 'STANDARD', 155, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('98239900-014e-4dfa-9663-4cfb91c5defa', '156', 'Sing We Now at Parting', 'STANDARD', 156, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('3e9d645e-e6dd-4f13-9139-0f7985ede0e0', '157', 'Thy Spirit, Lord, Has Stirred Our Souls', 'STANDARD', 157, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('22dbd924-6951-4274-9e33-067ad98dd07d', '158', 'Before Thee, Lord, I Bow My Head', 'STANDARD', 158, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('92862df6-f45e-4b1a-b343-77fa0f4b5dc7', '159', 'Now the Day Is Over', 'STANDARD', 159, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('58cd92f6-db98-4b1b-b426-7b4cfde98d55', '160', 'Softly Now the Light of Day', 'STANDARD', 160, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2d132756-4450-4096-a1ed-310981471758', '161', 'The Lord Be with Us', 'STANDARD', 161, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('c7b876e6-5ce1-4292-af51-36519aa56c57', '162', 'Lord, We Come before Thee Now', 'STANDARD', 162, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a94fb117-dfc3-42fb-8743-0652a78695b2', '163', 'Lord, Dismiss Us with Thy Blessing', 'STANDARD', 163, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5cba7ba1-e531-47d9-b340-41b0195ebe75', '164', 'Great God, to Thee My Evening Song', 'STANDARD', 164, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e183a749-bec3-43ca-900e-edbad11f5630', '165', 'Abide with Me; ''Tis Eventide', 'STANDARD', 165, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('faf3ff1a-ef73-4ea0-ae7c-f8da41c5b6cf', '166', 'Abide with Me!', 'STANDARD', 166, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('411636a0-841c-47e8-bd99-c5d7d32508be', '167', 'Come, Let Us Sing an Evening Hymn', 'STANDARD', 167, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8f37308c-2fc9-4ae7-a477-cbbdf8aafc2f', '168', 'As the Shadows Fall', 'STANDARD', 168, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('017269c5-0a2a-488c-8256-727eda5aa34d', '170', 'God, Our Father, Hear Us Pray', 'STANDARD', 170, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('925b7061-0c82-4159-9e5c-c94bbad3ce4e', '171', 'With Humble Heart', 'STANDARD', 171, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('606d1c13-f89c-4758-8988-bbe89ae30202', '174', 'While of These Emblems We Partake', 'STANDARD', 174, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('0c307b19-dd2d-4b23-8e36-eab6cc495567', '176', '''Tis Sweet to Sing the Matchless Love', 'STANDARD', 176, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('94ec3b96-3d52-482e-b984-336a23cbca0f', '177', '''Tis Sweet to Sing the Matchless Love', 'STANDARD', 177, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('efae2712-f0a7-42fb-a373-8db94690b48b', '178', 'O Lord of Hosts', 'STANDARD', 178, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4027ac14-2932-4547-8a1a-74c9db22e717', '179', 'Again, Our Dear Redeeming Lord', 'STANDARD', 179, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('26b12375-f893-489c-8b6b-3608bff9d092', '180', 'Father in Heaven, We Do Believe', 'STANDARD', 180, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ac8853b6-8f74-4609-a78a-abb586bb5f2c', '181', 'Jesus of Nazareth, Savior and King', 'STANDARD', 181, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d0f43eef-12f2-4faa-b3f1-f725ff050a13', '182', 'We''ll Sing All Hail to Jesus'' Name', 'STANDARD', 182, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('322f9ef3-10fb-4e77-a5ea-704688153375', '183', 'In Remembrance of Thy Suffering', 'STANDARD', 183, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d277e027-a64e-47ad-bf2c-f60c099809a5', '184', 'Upon the Cross of Calvary', 'STANDARD', 184, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('25510433-2dc7-4275-8f16-aaef43a6e391', '185', 'Reverently and Meekly Now', 'STANDARD', 185, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('f802d5df-69b1-4d4d-8cba-12ed3170526b', '186', 'Again We Meet around the Board', 'STANDARD', 186, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5a66e459-8235-4c6f-8cbd-35691ee8198f', '188', 'Thy Will, O Lord, Be Done', 'STANDARD', 188, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('256219b6-0ecb-40bd-91f8-f0de07b4b2fb', '189', 'O Thou, Before the World Began', 'STANDARD', 189, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('7a73281b-df79-43d3-9cad-19b610f724de', '190', 'In Memory of the Crucified', 'STANDARD', 190, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('6152ac80-f50a-433d-8cbc-4e17afc871e7', '191', 'Behold the Great Redeemer Die', 'STANDARD', 191, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('339bc3da-27e2-42b6-b694-b772a5fcc635', '192', 'He Died! The Great Redeemer Died', 'STANDARD', 192, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2db7d525-4b18-4069-b5e7-8f86578a4c45', '194', 'There Is a Green Hill Far Away', 'STANDARD', 194, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('fa19e0fb-49eb-40ee-ac1b-9f7168d92efd', '195', 'How Great the Wisdom and the Love', 'STANDARD', 195, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('24f70453-bc0c-4b69-959d-3c8bf734e1c4', '196', 'Jesus, Once of Humble Birth', 'STANDARD', 196, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('237ffdfc-0c0f-4e2d-a326-49a7c8dc4e6a', '197', 'O Savior, Thou Who Wearest a Crown', 'STANDARD', 197, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a8d8be67-8ea4-46e0-896c-e3f7634d11c7', '198', 'That Easter Morn', 'STANDARD', 198, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a2d1bf14-c826-40a7-9a2f-87cf9a8946eb', '200', 'Christ the Lord Is Risen Today', 'STANDARD', 200, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('803af218-ca25-48a1-9a47-6b0d1909df18', '201', 'Joy to the World', 'STANDARD', 201, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('925facf7-3646-462e-8885-622575b29fa4', '202', 'Oh, Come, All Ye Faithful', 'STANDARD', 202, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('88fdbb74-fb81-4872-b664-024759c4cdcd', '203', 'Angels We Have Heard on High', 'STANDARD', 203, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('f1952f87-af9c-4db6-bfea-96458e8a1b72', '204', 'Silent Night', 'STANDARD', 204, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5e315190-2cd6-403f-a8f6-f134698bf4b9', '205', 'Once in Royal David''s City', 'STANDARD', 205, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9791004d-d596-4d8d-95a4-91889ccbb8db', '206', 'Away in a Manger', 'STANDARD', 206, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9fe565a8-54bb-42bc-9298-05ebe88f499c', '207', 'It Came upon the Midnight Clear', 'STANDARD', 207, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ed51ae9c-248a-42a6-a1c8-7add1773e4da', '208', 'O Little Town of Bethlehem', 'STANDARD', 208, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2e82acba-2e32-4553-9e9c-b3566ee295b9', '209', 'Hark! The Herald Angels Sing', 'STANDARD', 209, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('86638ddd-1cc8-4624-92ea-21016376a269', '210', 'With Wondering Awe', 'STANDARD', 210, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5558e3c6-865e-4036-a271-0e3bf5eff355', '211', 'While Shepherds Watched Their Flocks', 'STANDARD', 211, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('3a30189d-7c79-4d23-8854-0309f91f121a', '212', 'Far, Far Away on Judea''s Plains', 'STANDARD', 212, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('0f0b8850-ec48-460b-b37f-2d77b8d75a4d', '213', 'The First Noel', 'STANDARD', 213, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('f24f1d50-4a81-40b5-943b-3f6001b3f893', '214', 'I Heard the Bells on Christmas Day', 'STANDARD', 214, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ceb5ce67-0c14-4ca6-ac11-129a6fa43d1b', '215', 'Ring Out, Wild Bells', 'STANDARD', 215, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('1cc879ba-1c28-4db7-a016-81406ad40715', '216', 'We Are Sowing', 'STANDARD', 216, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('91584a7a-f9c4-4643-88df-881e79fc45ba', '217', 'Come, Let Us Anew', 'STANDARD', 217, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('bdfa968a-c80e-42ec-a5ca-f31f4642fdd6', '218', 'We Give Thee But Thine Own', 'STANDARD', 218, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b5f9aa14-d650-48e8-bd6b-2a63182c2960', '221', 'Dear to the Heart of the Shepherd', 'STANDARD', 221, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5a6a8416-2ae9-431e-86b1-e64e1d235cf4', '222', 'Hear Thou Our Hymn, O Lord', 'STANDARD', 222, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('dfa5369a-4c0f-4145-b5d7-adda1a50147c', '224', 'I Have Work Enough to Do', 'STANDARD', 224, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('fda11375-e59c-46ee-93f3-dfd35c608192', '225', 'We Are Marching On to Glory', 'STANDARD', 225, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4b23b79f-e718-4f72-8240-f5c300de7dea', '226', 'Improve the Shining Moments', 'STANDARD', 226, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('dca19358-9d8b-4289-a4f7-71c5f0685d1a', '228', 'You Can Make the Pathway Bright', 'STANDARD', 228, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b05484fd-1aab-4f5c-bc4e-623fef637258', '229', 'Today, While the Sun Shines', 'STANDARD', 229, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('c4ba7a7e-217d-4a7e-916d-9d08b4b7fc4e', '230', 'Scatter Sunshine', 'STANDARD', 230, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('92360a9d-f0b2-48a7-9e09-6cbf67f5e568', '231', 'Father, Cheer Our Souls Tonight', 'STANDARD', 231, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('17855fcc-4740-42b6-8257-ecc9df0dfef3', '232', 'Let Us Oft Speak Kind Words', 'STANDARD', 232, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a8a10f4a-7d53-4a0a-a8b9-54dfbc7cefe7', '233', 'Nay, Speak No Ill', 'STANDARD', 233, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b638253f-6e4f-40a9-95a3-028cac2a50a3', '234', 'Jesus, Mighty King in Zion', 'STANDARD', 234, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d9937716-74b0-4154-9f85-bdcd8df0ce39', '235', 'Should You Feel Inclined to Censure', 'STANDARD', 235, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('59eb484b-794d-4aa2-84f2-40ab012cf89b', '236', 'Lord, Accept into Thy Kingdom', 'STANDARD', 236, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('55aae799-d32b-4b4d-83aa-56d8f048731f', '238', 'Behold Thy Sons and Daughters, Lord', 'STANDARD', 238, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ceff2a91-c1f2-4cce-af7e-3eca78c9b93e', '239', 'Choose the Right', 'STANDARD', 239, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('cbcdac04-80ca-4ef1-9cd9-89f105383fed', '240', 'Know This, That Every Soul Is Free', 'STANDARD', 240, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b960097f-2cb2-4571-9c15-8c1c0d45de1d', '242', 'Praise God, from Whom All Blessings Flow', 'STANDARD', 242, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ce10de7b-406a-41ad-ad0f-545c972f08f7', '244', 'Come Along, Come Along', 'STANDARD', 244, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('23e34c84-1486-464f-b2d9-bd20d8d1fa94', '246', 'Onward, Christian Soldiers', 'STANDARD', 246, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('32931b4d-1b1a-4e2a-b64b-65788a2d6457', '248', 'Up, Awake, Ye Defenders of Zion', 'STANDARD', 248, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('63ec76c7-e970-46eb-889a-ced8d3dc02b6', '249', 'Called to Serve', 'STANDARD', 249, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d95c9673-6642-42dd-a49d-cb2eaf0f33db', '250', 'We Are All Enlisted', 'STANDARD', 250, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b11d7db7-b3d2-4571-861b-fc461a5fec58', '251', 'Behold! A Royal Army', 'STANDARD', 251, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('44a239e1-d7d9-4968-a81d-390502d72c0a', '252', 'Put Your Shoulder to the Wheel', 'STANDARD', 252, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4162e4cc-c812-4806-b57a-7b80752afb45', '253', 'Like Ten Thousand Legions Marching', 'STANDARD', 253, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('45946288-c548-49ba-af13-4e66cf3f8b73', '254', 'True to the Faith', 'STANDARD', 254, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e77be4f2-d391-4456-a21e-aa55d8f7324c', '256', 'As Zion''s Youth in Latter Days', 'STANDARD', 256, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('10a62cb8-55d8-445a-b724-f204f34a6e79', '257', 'Rejoice! A Glorious Sound Is Heard', 'STANDARD', 257, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e605ce8c-7427-4df5-9d54-1c1989a14702', '258', 'O Thou Rock of Our Salvation', 'STANDARD', 258, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('02c588d1-2351-4e4a-8099-1d8cdfbdaefb', '261', 'Thy Servants Are Prepared', 'STANDARD', 261, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4d2077d1-750b-491c-93be-27ce43c04b62', '262', 'Go, Ye Messengers of Glory', 'STANDARD', 262, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ac618af8-655c-4073-aa3c-986332747dc0', '263', 'Go Forth with Faith', 'STANDARD', 263, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a4b85c7e-e07f-48ef-8d50-37cdb4caefd1', '265', 'Arise, O God, and Shine', 'STANDARD', 265, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e42f77bf-8963-4d20-b643-192d0877e1d1', '266', 'The Time Is Far Spent', 'STANDARD', 266, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('3a47c9ea-a00a-422d-884e-7530db04cb00', '267', 'How Wondrous and Great', 'STANDARD', 267, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('01d6245e-e56e-46c2-bc07-a5906a2dfe1e', '268', 'Come, All Whose Souls Are Lighted', 'STANDARD', 268, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('64d3d221-e6d5-4a31-b76a-7d8947af1ec2', '269', 'Jehovah, Lord of Heaven and Earth', 'STANDARD', 269, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('f71ec4bb-5967-47e1-b6a4-f31b56e947d8', '271', 'Oh, Holy Words of Truth and Love', 'STANDARD', 271, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ac057114-fa20-421a-94c5-5f1968a7e0e8', '272', 'Oh Say, What Is Truth?', 'STANDARD', 272, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('cd565bfc-7282-4066-9f77-b21c3ac60d7e', '273', 'Truth Reflects upon Our Senses', 'STANDARD', 273, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ae2cf624-0059-459b-8987-639a474a05a8', '274', 'The Iron Rod', 'STANDARD', 274, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('59a98734-41fe-4f32-989a-d895ee70784d', '275', 'Men Are That They Might Have Joy', 'STANDARD', 275, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8db25dd8-ccca-4e9b-aeda-4ab01c07c1ec', '276', 'Come Away to the Sunday School', 'STANDARD', 276, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('c13e0167-722f-4985-b54c-e78c1f5ddbd2', '277', 'As I Search the Holy Scriptures', 'STANDARD', 277, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('13514bf5-4103-4223-9c4a-b15755dfa933', '278', 'Thanks for the Sabbath School', 'STANDARD', 278, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('500365d5-96a7-456e-9e6d-7aef991c4697', '279', 'Thy Holy Word', 'STANDARD', 279, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('59c9931e-1922-4adf-80d8-69315342373a', '280', 'Welcome, Welcome, Sabbath Morning', 'STANDARD', 280, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9988b313-2969-4672-99be-2518473071ec', '281', 'Help Me Teach with Inspiration', 'STANDARD', 281, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('993c7c9c-77bc-4fd6-b13f-a6f009b0a2e8', '282', 'We Meet Again in Sabbath School', 'STANDARD', 282, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('71960ac5-d609-4b5b-a2de-8ef79f1a0b4e', '283', 'The Glorious Gospel Light Has Shone', 'STANDARD', 283, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('483132f0-e341-4b34-83a9-24829e84bb90', '285', 'God Moves in a Mysterious Way', 'STANDARD', 285, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('928bad0a-ac7b-4c5b-b6ac-82e91b2fd08d', '286', 'Oh, What Songs of the Heart', 'STANDARD', 286, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d68413a6-f116-4ce3-93b7-91537eab380a', '287', 'Rise, Ye Saints, and Temples Enter', 'STANDARD', 287, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d4dee98e-80dd-4b14-b32f-c042f0710891', '288', 'How Beautiful Thy Temples, Lord', 'STANDARD', 288, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('4f070090-2e90-4916-bcde-d764c470b518', '289', 'Holy Temples on Mount Zion', 'STANDARD', 289, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('13f1c815-aa60-496e-bec8-2ffddf8872a0', '290', 'Rejoice, Ye Saints of Latter Days', 'STANDARD', 290, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('2715953b-f735-4123-9dde-946403287e49', '291', 'Turn Your Hearts', 'STANDARD', 291, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('1868ed62-e062-496b-b92b-98d86e41c94b', '293', 'Each Life That Touches Ours for Good', 'STANDARD', 293, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8f26a4ce-fa82-42b8-961f-8c997a0a25c7', '295', 'O Love That Glorifies the Son', 'STANDARD', 295, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('94157194-e2f3-4c64-a5e0-e6a75d251c6c', '296', 'Our Father, by Whose Name', 'STANDARD', 296, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d171722e-c36f-4d72-9dda-9c1ed56ffb42', '297', 'From Homes of Saints Glad Songs Arise', 'STANDARD', 297, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('52a5355c-f70e-402a-9aea-7c05dcb0d3bd', '298', 'Home Can Be a Heaven on Earth', 'STANDARD', 298, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('bdb4763a-6850-4123-a326-bef75680bee1', '299', 'Children of Our Heavenly Father', 'STANDARD', 299, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('3739beac-445f-4a80-9e29-9a32b36947f3', '300', 'Families Can Be Together Forever', 'STANDARD', 300, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('1af288ee-95a8-44fc-867a-ed235ad2eff1', '303', 'Keep the Commandments', 'STANDARD', 303, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b5f5d812-b505-4bf5-b3ff-cea42cecfd1e', '305', 'The Light Divine', 'STANDARD', 305, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('606ac57c-30f6-40ec-87e4-1c10c9e55291', '306', 'God''s Daily Care', 'STANDARD', 306, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e9f925b7-2c4c-4d04-9bb0-c9be8fd7882c', '307', 'In Our Lovely Deseret', 'STANDARD', 307, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9593120b-e8c7-4ceb-932a-0fc419749943', '310', 'A Key Was Turned in Latter Days (Women)', 'STANDARD', 310, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ecb22a65-bb5a-469b-ae5b-2fbd62387156', '311', 'We Meet Again as Sisters (Women)', 'STANDARD', 311, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('89925502-709e-4527-8562-dcbf1ab8dc1d', '312', 'We Ever Pray for Thee (Women)', 'STANDARD', 312, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e1a5a072-e02d-427d-9bbe-b3c775b27f01', '313', 'God Is Love (Women)', 'STANDARD', 313, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9f697dcf-ddaf-4b4f-af2b-e48eed3bee00', '314', 'How Gentle God''s Commands (Women)', 'STANDARD', 314, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('7b11bfa9-e33e-4b6b-8ddb-20d46016640a', '315', 'Jesus, the Very Thought of Thee (Women)', 'STANDARD', 315, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('b9dee206-bbd7-4686-8092-953a9549811c', '316', 'The Lord Is My Shepherd (Women)', 'STANDARD', 316, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('da336b86-bd20-4cc7-b1be-f333365677a3', '317', 'Sweet Is the Work (Women)', 'STANDARD', 317, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a0fbc742-585c-4ee3-a7a6-fbf422930a4a', '318', 'Love at Home (Women)', 'STANDARD', 318, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('53ddf1cc-9bb9-4d70-884a-921637619c43', '319', 'Ye Elders of Israel (Men)', 'STANDARD', 319, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('bef60500-f454-4797-8b0c-d157c7bd9226', '320', 'The Priesthood of Our Lord (Men)', 'STANDARD', 320, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('197c0acf-9965-4848-9959-9b472d5b2c25', '321', 'Ye Who Are Called to Labor (Men)', 'STANDARD', 321, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('39d0f822-5dd4-41d4-bc3c-cdc9bebe747e', '322', 'Come, All Ye Sons of God (Men)', 'STANDARD', 322, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('ffb445b9-af33-4c4e-9f86-6724aab97345', '323', 'Rise Up, O Men of God (Men''s Choir)', 'STANDARD', 323, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('5f3c41a3-de8f-478b-b733-29e702d4a4af', '324', 'Rise Up, O Men of God (Men)', 'STANDARD', 324, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9585b663-d5c0-426d-8b05-9bceb7eb4f0b', '325', 'See the Mighty Priesthood Gathered (Men''s Choir)', 'STANDARD', 325, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('c7c4c737-6205-4e22-b0a2-abdcebf900d9', '326', 'Come, Come, Ye Saints (Men''s Choir)', 'STANDARD', 326, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9f2e8229-4b96-489c-93e8-954a9aa9a0f7', '327', 'Go, Ye Messengers of Heaven (Men''s Choir)', 'STANDARD', 327, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('508e9441-2010-48de-b2af-23cce7a402d8', '328', 'An Angel from on High (Men''s Choir)', 'STANDARD', 328, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d92137a7-3757-4d19-8ef2-83e097c620d0', '329', 'Thy Servants Are Prepared (Men''s Choir)', 'STANDARD', 329, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('9eea3214-960f-42ea-aecc-adf4419ab198', '330', 'See, the Mighty Angel Flying (Men''s Choir)', 'STANDARD', 330, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('6c17daae-936d-4a8e-b061-b7520bddd583', '331', 'Oh Say, What Is Truth? (Men''s Choir)', 'STANDARD', 331, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('94b5c926-603c-413e-b859-86d4d2eca6dd', '332', 'Come, O Thou King of Kings (Men''s Choir)', 'STANDARD', 332, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a70e0a06-1e94-45bb-bc01-49f4eefe8ee2', '333', 'High on the Mountain Top (Men''s Choir)', 'STANDARD', 333, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('e53ab4eb-cb5e-4e63-b5cc-b5afb22ae30e', '334', 'I Need Thee Every Hour (Men''s Choir)', 'STANDARD', 334, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('058f7a7e-e7d5-43f6-94a2-558298d03591', '335', 'Brightly Beams Our Father''s Mercy (Men''s Choir)', 'STANDARD', 335, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('87152b71-c9f3-4093-9b5d-ba1a9d1dd7e9', '336', 'School Thy Feelings (Men''s Choir)', 'STANDARD', 336, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('a4f0681e-8bb4-400b-b6ba-0867f1d8b643', '337', 'O Home Beloved (Men''s Choir)', 'STANDARD', 337, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('8d837560-9f20-4f56-9248-af23f1f04320', '338', 'America the Beautiful', 'STANDARD', 338, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d1189065-2e5c-4e86-9ff4-f035ce5ac55d', '339', 'My Country, ''Tis of Thee', 'STANDARD', 339, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d8a5cac7-1776-43fe-ac3f-b3f3f6ba2f5a', '340', 'The Star-Spangled Banner', 'STANDARD', 340, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('d7cf12d1-f39c-4bee-8255-8d8f414029ab', '341', 'God Save the King', 'STANDARD', 341, true, '2026-09-22 17:55:03.362231-07', '2026-09-22 17:55:03.362231-07');
INSERT INTO public.hymn VALUES ('18bcc63a-b8f8-45a7-b0b7-4080a05400e1', '1059', 'This Is My Father’s World', 'NEW', 1059, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('1893d488-3924-406f-93b8-06530fe2f39b', '1070', 'The Miracle', 'NEW', 1070, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('b19b4eb4-397c-493f-931c-d564633a5220', '1060', 'Build an Ark', 'NEW', 1060, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('99dc2fe1-d349-4010-aad5-37f9abc4c80e', '1064', 'Great Is Thy Faithfulness', 'NEW', 1064, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('9cfb61a7-e979-4f3e-ba5c-746b4759c852', '1053', 'My Covenants', 'NEW', 1053, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('13386b37-6080-4843-ac42-e0e3888cb6d6', '1067', 'It’s Joyful to Live the Gospel', 'NEW', 1067, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('f8682961-02f9-4667-afea-bf2e64b0cfa1', '1055', 'The Power of the Holy Ghost', 'NEW', 1055, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('e8474887-04cd-4e68-a1e1-f6173fc1040e', '1054', 'When I Am Baptized', 'NEW', 1054, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('2c2305de-b78b-469a-8630-f7d13ee9129e', '1072', 'When I Survey the Wondrous Cross', 'NEW', 1072, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('402222d4-9951-47ab-88fe-7a23343ce139', '1065', 'Isaiah Said', 'NEW', 1065, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('7456b8ca-615d-4295-8261-a8b955bf0d2b', '1062', 'Lord, Accept Our Humble Fast', 'NEW', 1062, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('e7d2ff26-c581-44cf-adbb-fce81f0373af', '1061', 'Love Will Bless Our Home', 'NEW', 1061, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('34f14d68-58f6-4f6f-a9f4-57c740fd9e18', '1071', 'What God Calls Us To', 'NEW', 1071, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('1382e99f-0b2a-4feb-bc78-6f52e12802eb', '1069', 'Speak to Us, Lord', 'NEW', 1069, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('3b4d20b2-ce4d-482b-9557-cd464eacc70b', '1056', 'Elijah and the Still, Small Voice', 'NEW', 1056, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('d58ab87e-22ee-4f94-8423-b52213d08a12', '1058', 'My Song in the Night', 'NEW', 1058, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('23840196-99c3-4dc8-af56-daddb8ddab6d', '1057', 'Jesus Is My Shepherd', 'NEW', 1057, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('9a7a62ad-e04f-4666-9946-ffda7df07eec', '1068', 'To God Be the Glory', 'NEW', 1068, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('f2682f04-a863-49fa-86f4-05ff8c7663a5', '1052', 'Joyfully Bound', 'NEW', 1052, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('de05f2bd-6d47-4276-9607-3b08c39f5587', '1063', 'Peace, Peace, Be Still', 'NEW', 1063, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('6cdd9b2f-76b6-40fa-8eeb-bdddbb13076a', '1066', 'Fight the Good Fight', 'NEW', 1066, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');
INSERT INTO public.hymn VALUES ('6bc12706-2785-45a6-8363-e9f0f70432c7', '1210', 'Long Ago, Within a Garden', 'NEW', 1210, true, '2026-09-22 17:55:03.479261-07', '2026-09-22 17:55:03.479261-07');


--
-- Data for Name: import_run; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: internal_note; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: interview_calendar_subscription; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: media_asset; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_business_line; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_document; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_membership_ordinance; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_program_item; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_program_render; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: meeting_technology_checklist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: member_note; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_delivery; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_email_digest_item; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_email_preference; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_subscription; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: offline_mutation; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: public_program_layout; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: public_program_portal; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: public_program_share; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.role VALUES ('04298cfe-848d-44ad-8841-7455f8dcdb3f', 'PROGRAM_EDITOR', 'WARD');
INSERT INTO public.role VALUES ('25095636-dc80-4610-be06-c59dd7ce079f', 'STAKE_ADMIN', 'STAKE');


--
-- Data for Name: scheduled_interview; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: stake; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: stake_user_role; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: standard_calling; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.standard_calling VALUES ('97e42a4f-4988-4e29-b5e0-6b4474ae84b1', 'Bishop', 'Bishopric', 'ward', 1, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ac5430a6-ad1f-4609-bf90-753ea8cc739e', 'First Counselor in the Bishopric', 'Bishopric', 'ward', 2, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('cdd48e9a-67f6-45ed-9ef8-7c8f253751e7', 'Second Counselor in the Bishopric', 'Bishopric', 'ward', 3, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6d9d18d1-3392-422f-832e-ff0cf2f3530f', 'Executive Secretary', 'Bishopric', 'ward', 4, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('000ab8bf-2f70-40f9-acde-43b81ffe10eb', 'Ward Clerk', 'Bishopric', 'ward', 5, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('2fdb6185-3771-4de0-bcaa-1b399f31744f', 'Assistant Ward Clerk', 'Bishopric', 'ward', 6, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('0ebf330b-a2b0-4f9b-aa0c-1a91768a8b6e', 'Assistant Ward Clerk (Finance)', 'Bishopric', 'ward', 7, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('48e8e554-4182-4d82-8a6d-f42de9ad2320', 'Assistant Ward Clerk (Membership)', 'Bishopric', 'ward', 8, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1effa966-f49d-476a-bda6-00c7c204c5c0', 'Elders Quorum President', 'Elders Quorum', 'ward', 10, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('301653dd-1c49-4db9-a981-83af4b20f3bc', 'First Counselor in the Elders Quorum Presidency', 'Elders Quorum', 'ward', 11, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('28121e08-b9f3-4769-9a05-32eaaecd381e', 'Second Counselor in the Elders Quorum Presidency', 'Elders Quorum', 'ward', 12, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1fef0122-2800-4f40-8bd8-67f74e0d405f', 'Elders Quorum Secretary', 'Elders Quorum', 'ward', 13, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('49fe6db1-1a08-4c2f-8420-391a9d2c4d95', 'Elders Quorum Instructor', 'Elders Quorum', 'ward', 14, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1f7c181b-69d0-43e3-b98a-f3f4e5d2b133', 'Relief Society President', 'Relief Society', 'ward', 20, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('bebe4195-7860-425c-bf42-ef2ab42ffa48', 'First Counselor in the Relief Society Presidency', 'Relief Society', 'ward', 21, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f87ff14c-7eb7-4fcb-ace7-a59397085710', 'Second Counselor in the Relief Society Presidency', 'Relief Society', 'ward', 22, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('9d4898d2-2171-4fec-9f7e-4c0b3f632c53', 'Relief Society Secretary', 'Relief Society', 'ward', 23, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('eb26d012-917d-4071-8924-a8d41f57cad9', 'Relief Society Teacher', 'Relief Society', 'ward', 24, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('fb3c9e71-d24b-49c6-83bb-a93846635a86', 'Relief Society Ministering Secretary', 'Relief Society', 'ward', 25, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('58a197c3-5e2f-49ec-8cbf-270dca82a13f', 'Young Men President', 'Young Men', 'ward', 30, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ac54a79f-95eb-49ea-8331-87a724d2e400', 'First Counselor in the Young Men Presidency', 'Young Men', 'ward', 31, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('471b8437-008b-42cf-b406-7d88ff892735', 'Second Counselor in the Young Men Presidency', 'Young Men', 'ward', 32, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f37e6e08-019a-4b7d-ba2c-0ac879c8c49b', 'Young Men Secretary', 'Young Men', 'ward', 33, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('06fe5dd7-b496-4f8e-9671-83f836bb0506', 'Priests Quorum Adviser', 'Young Men', 'ward', 34, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('dced0b67-daab-4e6e-a921-1bc122924fec', 'Teachers Quorum Adviser', 'Young Men', 'ward', 35, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('bd199b9c-a288-4499-8a57-a48c08710a0b', 'Deacons Quorum Adviser', 'Young Men', 'ward', 36, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d34d4978-8d8c-4eea-bd06-f8cc3166b5ed', 'Young Women President', 'Young Women', 'ward', 40, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('10e2af1f-d316-48a1-9e4c-c05a8c19f522', 'First Counselor in the Young Women Presidency', 'Young Women', 'ward', 41, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f67411b3-226f-4742-8e66-20bc2bd3cd2f', 'Second Counselor in the Young Women Presidency', 'Young Women', 'ward', 42, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('e3baa935-104d-4eb4-90d8-fc4de85e6e7d', 'Young Women Secretary', 'Young Women', 'ward', 43, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c260b782-a2f0-4dff-ba99-a7202e847913', 'Young Women Adviser', 'Young Women', 'ward', 44, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('552a79ea-be49-459f-91de-392efd178a49', 'Young Women Camp Director', 'Young Women', 'ward', 45, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('73ef05f5-9e45-474f-9c87-c861f0ac767d', 'Primary President', 'Primary', 'ward', 50, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('28ad8041-b4cd-41e4-8134-406a1f7c19aa', 'First Counselor in the Primary Presidency', 'Primary', 'ward', 51, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ede9ad02-6d92-4573-a724-dba09c95b30b', 'Second Counselor in the Primary Presidency', 'Primary', 'ward', 52, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('12577b54-1dea-4fff-9434-b31155c6b546', 'Primary Secretary', 'Primary', 'ward', 53, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('cfe40bba-54e0-4083-b70b-a83bf14eec44', 'Primary Music Leader', 'Primary', 'ward', 54, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ab3c5424-3322-4c25-bb7a-853fe674e2de', 'Primary Pianist', 'Primary', 'ward', 55, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('595a38c7-1ade-4374-a78f-3a17ea704322', 'Activity Days Leader', 'Primary', 'ward', 56, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('94bd8dd1-aad9-465c-a3fb-c476f065ca3e', 'Nursery Leader', 'Primary', 'ward', 57, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('27e73fd1-bb87-4659-b587-90bae7d49e66', 'Sunday School President', 'Sunday School', 'ward', 60, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6ded3f35-648f-49e5-91ec-0b88ac455634', 'First Counselor in the Sunday School Presidency', 'Sunday School', 'ward', 61, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('dd2274ba-f756-4cac-a8a7-8098ee71e643', 'Second Counselor in the Sunday School Presidency', 'Sunday School', 'ward', 62, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c1f0e508-bd0c-41e2-8223-129f33658542', 'Sunday School Secretary', 'Sunday School', 'ward', 63, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f966ca96-157b-4c4a-9088-502d694847d4', 'Sunday School Teacher', 'Sunday School', 'ward', 64, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d0f0a310-4a4c-49ec-805f-094e5077b804', 'Ward Mission Leader', 'Ward Mission', 'ward', 70, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('28eebaa4-0a66-412f-bd96-2d21935c133e', 'Ward Missionary', 'Ward Mission', 'ward', 71, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('9bd25708-f313-4fb0-b407-f4e0de3d7825', 'Ward Temple and Family History Consultant', 'Temple and Family History', 'ward', 80, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('0400c5fd-32c2-4dc4-9609-9527e618b8c0', 'Ward Temple and Family History Leader', 'Temple and Family History', 'ward', 81, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('cc57e144-13a5-417c-8a55-b4a1b2237ae1', 'Ward Music Coordinator', 'Music', 'ward', 90, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b9577423-d132-4288-a467-27bc9d349907', 'Ward Choir Director', 'Music', 'ward', 91, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('7b40010c-3cf0-48d2-9694-c16eb795c579', 'Ward Organist', 'Music', 'ward', 92, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('181b3aab-4ed8-42bb-ad9c-e9cdd8ec87b4', 'Sacrament Meeting Chorister', 'Music', 'ward', 93, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('7b43f853-68ff-4f3e-ad53-47ee3fd561ed', 'Ward Accompanist', 'Music', 'ward', 94, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b318171b-108c-4e75-b87e-8190cb65470f', 'Self-Reliance Specialist', 'Self-Reliance and Welfare', 'ward', 100, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b4681dba-9db5-4a72-bdec-f35fcc489c30', 'Welfare Specialist', 'Self-Reliance and Welfare', 'ward', 101, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d10330f5-0916-4df5-99cb-b811b59704fd', 'Employment Specialist', 'Self-Reliance and Welfare', 'ward', 102, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('7fad3f0d-b5e5-4aa2-a452-51ad5df7ea74', 'Ward Communications Director', 'Other Ward Callings', 'ward', 110, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('934d202c-add5-46da-813e-0aa8606169fa', 'Ward Newsletter Editor', 'Other Ward Callings', 'ward', 111, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('3c71aa22-8f24-4764-a368-60a1d4a0f087', 'Ward Historian', 'Other Ward Callings', 'ward', 112, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f2d01d35-2b0b-415d-9f93-95ead0e631f9', 'Ward Emergency Preparedness Specialist', 'Other Ward Callings', 'ward', 113, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('fe9cfb22-e6b3-4c38-8535-61b1234de26c', 'Ward Librarian', 'Other Ward Callings', 'ward', 114, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6ffbd6bb-fc04-43a5-a382-42a833d2ab53', 'Assistant Ward Librarian', 'Other Ward Callings', 'ward', 115, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d71dff70-b14b-4e76-bc02-e12127db041f', 'Sunday Meeting Schedule Coordinator', 'Other Ward Callings', 'ward', 116, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('20aeb1e3-a3e1-4cd8-a360-ca01b24c2f04', 'Stake President', 'Stake Presidency', 'stake', 1, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('35cee368-dffc-4596-95f9-27c7e3b8323f', 'First Counselor in the Stake Presidency', 'Stake Presidency', 'stake', 2, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b5824c85-98ec-431e-b57c-d4ef7380dfcb', 'Second Counselor in the Stake Presidency', 'Stake Presidency', 'stake', 3, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d55ebb73-5271-433d-99b6-6b88e59ab51e', 'Stake Executive Secretary', 'Stake Presidency', 'stake', 4, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('53e8141a-1a8c-4779-a8aa-6386853f073b', 'Stake Clerk', 'Stake Presidency', 'stake', 5, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('24e9bb6a-60fe-4809-a48e-7c5f00f83097', 'Assistant Stake Clerk', 'Stake Presidency', 'stake', 6, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('bfa26c1f-60e8-42d9-8ba0-6152f26496ec', 'Assistant Stake Clerk (Finance)', 'Stake Presidency', 'stake', 7, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ee38274b-c28e-4396-a42f-74577cde3571', 'Assistant Stake Clerk (Membership)', 'Stake Presidency', 'stake', 8, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('93db4942-d05f-46f8-a69f-df40505ebb05', 'Patriarch', 'Stake Presidency', 'stake', 9, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('a4a4ae20-82c1-49b0-84ce-8e6fa6797992', 'High Councilor', 'High Council', 'stake', 10, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('12ab220a-f27c-4ee7-ae2c-2fa102c0301a', 'Stake Relief Society President', 'Stake Relief Society', 'stake', 20, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('bc81f845-41e8-4fde-a4ac-9b661158f73a', 'First Counselor in the Stake Relief Society Presidency', 'Stake Relief Society', 'stake', 21, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1d366271-49e8-4b88-bcac-d9d0b94587c3', 'Second Counselor in the Stake Relief Society Presidency', 'Stake Relief Society', 'stake', 22, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('aeb4d9c1-8bc7-474c-8462-a83211b08df9', 'Stake Relief Society Secretary', 'Stake Relief Society', 'stake', 23, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('faeadd99-af86-46f4-9ed5-3c205d3eb349', 'Stake Young Men President', 'Stake Young Men', 'stake', 30, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c95f04c6-b61a-4b60-a593-b7cbbd5faab9', 'First Counselor in the Stake Young Men Presidency', 'Stake Young Men', 'stake', 31, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('63ec2875-0125-49a2-9a67-279e7e8ab6d9', 'Second Counselor in the Stake Young Men Presidency', 'Stake Young Men', 'stake', 32, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('8b7ce90a-036e-42a7-aa06-3b9f35b636c6', 'Stake Young Men Secretary', 'Stake Young Men', 'stake', 33, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c7346f5c-d3e7-4689-82c9-7a6a490c7350', 'Stake Young Women President', 'Stake Young Women', 'stake', 40, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('95c2269b-27b0-4693-9738-2fffce86554c', 'First Counselor in the Stake Young Women Presidency', 'Stake Young Women', 'stake', 41, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f069d8b4-b19c-40d1-a4cc-3e104b13728d', 'Second Counselor in the Stake Young Women Presidency', 'Stake Young Women', 'stake', 42, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('43317ba3-295b-4d65-9938-dcc973eb0d51', 'Stake Young Women Secretary', 'Stake Young Women', 'stake', 43, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6adf3bc7-6e58-4ed8-8619-abddeb66060d', 'Stake Primary President', 'Stake Primary', 'stake', 50, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c5775e6c-1367-4a2f-880e-896a114e6524', 'First Counselor in the Stake Primary Presidency', 'Stake Primary', 'stake', 51, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('2834e7e7-858e-4da2-9d1f-d5dcd0558bfa', 'Second Counselor in the Stake Primary Presidency', 'Stake Primary', 'stake', 52, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('2cf784cb-6a1b-4c94-b571-536641e16401', 'Stake Primary Secretary', 'Stake Primary', 'stake', 53, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('249d13e7-b95b-49aa-9683-91c85331cdc0', 'Stake Sunday School President', 'Stake Sunday School', 'stake', 60, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d39631bf-d307-44ea-afbc-c539ee574647', 'First Counselor in the Stake Sunday School Presidency', 'Stake Sunday School', 'stake', 61, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('820ebd1c-a694-481f-a335-25d11b56e871', 'Second Counselor in the Stake Sunday School Presidency', 'Stake Sunday School', 'stake', 62, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('a8da9946-0ad4-4054-902f-07ac9428fad8', 'Stake Sunday School Secretary', 'Stake Sunday School', 'stake', 63, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('0a9510f0-0398-4c41-83e5-27337488cc97', 'Stake Music Coordinator', 'Stake Music', 'stake', 70, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('82c6745e-091d-418a-bcff-a255d9d8a50a', 'Stake Choir Director', 'Stake Music', 'stake', 71, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c8dc44d4-2dbe-4c78-b13e-68f2303392db', 'Stake Organist', 'Stake Music', 'stake', 72, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('98180c46-ce86-48aa-8a3c-104643fc117b', 'Stake Historian', 'Other Stake Callings', 'stake', 80, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('e1e16961-4445-4469-9c2c-1991528d1330', 'Stake Communications Director', 'Other Stake Callings', 'stake', 81, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('9dfed60f-c08b-441d-966f-8b0d6be769b2', 'Stake Temple and Family History Consultant', 'Other Stake Callings', 'stake', 82, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('67c1c959-69dc-4cda-b277-3f7bc2503a16', 'Branch President', 'Branch Presidency', 'branch', 1, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6db0a16b-518e-4997-a0b2-8dda775cd7c7', 'First Counselor in the Branch Presidency', 'Branch Presidency', 'branch', 2, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d5dcf7bf-bf0c-4861-9989-6874da62a38b', 'Second Counselor in the Branch Presidency', 'Branch Presidency', 'branch', 3, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('055e3f11-198c-4ac4-a1d2-95a027e1395f', 'Branch Executive Secretary', 'Branch Presidency', 'branch', 4, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('cb22a82a-bf43-43f5-90a5-f346fd69d8a8', 'Branch Clerk', 'Branch Presidency', 'branch', 5, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('532f3fda-a6af-4314-8f32-4c9377359a1d', 'Assistant Branch Clerk', 'Branch Presidency', 'branch', 6, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f129965a-9993-4fd4-8c65-3f768fb59009', 'Branch Elders Quorum President', 'Elders Quorum', 'branch', 10, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b0410fbb-5578-4f68-a6d8-98a36d7364d5', 'First Counselor in the Branch Elders Quorum Presidency', 'Elders Quorum', 'branch', 11, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b8778cbf-6209-4dd6-9d52-69114703c53c', 'Second Counselor in the Branch Elders Quorum Presidency', 'Elders Quorum', 'branch', 12, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('fdb4c11d-0564-4925-b361-4e6b17729aa8', 'Branch Elders Quorum Secretary', 'Elders Quorum', 'branch', 13, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('9de59926-7196-45ff-966f-85c602851169', 'Branch Relief Society President', 'Relief Society', 'branch', 20, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1cdaa491-4978-487c-ba6c-3c5b643917b5', 'First Counselor in the Branch Relief Society Presidency', 'Relief Society', 'branch', 21, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('0fb9d0ca-8298-4ee7-9770-9ad2aa7b1f0b', 'Second Counselor in the Branch Relief Society Presidency', 'Relief Society', 'branch', 22, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('97cc8a34-0564-4a47-b393-70c4ca34876e', 'Branch Relief Society Secretary', 'Relief Society', 'branch', 23, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d38e8343-d9cd-4d11-a722-84dc14d1e9d3', 'Branch Young Men President', 'Young Men', 'branch', 30, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('e0a62e7f-05b5-4118-b472-e2dcb6d525b6', 'Branch Young Women President', 'Young Women', 'branch', 40, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('1f6d8039-39bd-4802-9e3f-3d05cae0ac4c', 'Branch Primary President', 'Primary', 'branch', 50, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('6da3d130-bcd3-4c4b-8564-0b5c39ef3303', 'First Counselor in the Branch Primary Presidency', 'Primary', 'branch', 51, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('aeee1047-49f5-4b89-b916-076fe9aed001', 'Second Counselor in the Branch Primary Presidency', 'Primary', 'branch', 52, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('318c24a9-71ba-43b5-83b4-7b8a726e2ddb', 'Branch Sunday School President', 'Sunday School', 'branch', 60, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('0db9ad4e-350f-4eba-b567-25568f62a1a1', 'Branch Mission Leader', 'Branch Mission', 'branch', 70, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('e6b96ac2-9ebd-4482-8a25-3324caa856aa', 'Branch Music Coordinator', 'Music', 'branch', 80, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('5dff96b5-e7e8-47df-9c95-5b9727a4cdde', 'District President', 'District Presidency', 'district', 1, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('c3fa98e4-d63c-417d-af95-eed85abe9293', 'First Counselor in the District Presidency', 'District Presidency', 'district', 2, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('58acd82c-380f-4ce4-b139-f333b963ee46', 'Second Counselor in the District Presidency', 'District Presidency', 'district', 3, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('587ed7fc-8b6c-4797-910f-66a24c3f47f8', 'District Executive Secretary', 'District Presidency', 'district', 4, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('055ca483-461a-4b08-8a91-04e4d14463c4', 'District Clerk', 'District Presidency', 'district', 5, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('12206d3a-766a-4deb-8364-a31fa8ac4cab', 'Assistant District Clerk', 'District Presidency', 'district', 6, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f817579d-6310-4089-9ce2-234d4d38e3b3', 'District Relief Society President', 'District Relief Society', 'district', 20, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('baef39fe-8c7d-4ce2-8492-31113b2583dd', 'First Counselor in the District Relief Society Presidency', 'District Relief Society', 'district', 21, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('d202d01b-1a37-4a10-9563-7af96b090dbd', 'Second Counselor in the District Relief Society Presidency', 'District Relief Society', 'district', 22, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('646cb718-0bc7-45b7-b1f6-9033646060f8', 'District Relief Society Secretary', 'District Relief Society', 'district', 23, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('9f3e8258-9d0d-4733-9eb4-3898e52e5168', 'District Young Men President', 'District Young Men', 'district', 30, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('b670aad5-8b22-4b7b-827d-4e9bdb418fc8', 'District Young Women President', 'District Young Women', 'district', 40, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('53e387bb-0a5f-439e-8719-7e4004da24cd', 'District Primary President', 'District Primary', 'district', 50, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('f44c8aae-a53c-4506-987a-3c84e53da491', 'First Counselor in the District Primary Presidency', 'District Primary', 'district', 51, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('068df5d8-5769-46ce-821d-e165b3108546', 'Second Counselor in the District Primary Presidency', 'District Primary', 'district', 52, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('fb1728e4-21ea-4468-bba1-0a18d3711799', 'District Sunday School President', 'District Sunday School', 'district', 60, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('fa1256c4-1274-43a5-8985-ec327f72ffe5', 'District Historian', 'Other District Callings', 'district', 70, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');
INSERT INTO public.standard_calling VALUES ('ee90e4c9-1393-4eb0-9885-771639100459', 'District Mission Leader', 'District Mission', 'district', 80, true, '2026-09-22 17:55:02.997183-07', '2026-09-22 17:55:02.997183-07');


--
-- Data for Name: support_work_item; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_account; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_global_role; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_notification; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ward; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ward_document_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ward_feature_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ward_stand_template; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ward_user_role; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

--
-- Name: access_request access_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_request
    ADD CONSTRAINT access_request_pkey PRIMARY KEY (id);


--
-- Name: announcement announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bishopric_action bishopric_action_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_pkey PRIMARY KEY (id);


--
-- Name: bishopric_meeting bishopric_meeting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_meeting
    ADD CONSTRAINT bishopric_meeting_pkey PRIMARY KEY (id);


--
-- Name: calendar_event_cache calendar_event_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_cache
    ADD CONSTRAINT calendar_event_cache_pkey PRIMARY KEY (id);


--
-- Name: calendar_event_cache calendar_event_cache_ward_id_calendar_feed_id_external_uid__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_cache
    ADD CONSTRAINT calendar_event_cache_ward_id_calendar_feed_id_external_uid__key UNIQUE (ward_id, calendar_feed_id, external_uid, starts_at);


--
-- Name: calendar_feed calendar_feed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feed
    ADD CONSTRAINT calendar_feed_pkey PRIMARY KEY (id);


--
-- Name: calendar_feed calendar_feed_ward_id_feed_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feed
    ADD CONSTRAINT calendar_feed_ward_id_feed_url_key UNIQUE (ward_id, feed_url);


--
-- Name: calling_action calling_action_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_action
    ADD CONSTRAINT calling_action_pkey PRIMARY KEY (id);


--
-- Name: calling_assignment calling_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_assignment
    ADD CONSTRAINT calling_assignment_pkey PRIMARY KEY (id);


--
-- Name: document_template document_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_pkey PRIMARY KEY (id);


--
-- Name: document_template_version document_template_version_id_template_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template_version
    ADD CONSTRAINT document_template_version_id_template_unique UNIQUE (id, template_id);


--
-- Name: document_template_version document_template_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template_version
    ADD CONSTRAINT document_template_version_pkey PRIMARY KEY (id);


--
-- Name: document_template_version document_template_version_template_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template_version
    ADD CONSTRAINT document_template_version_template_id_version_key UNIQUE (template_id, version);


--
-- Name: event_outbox event_outbox_dedupe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_dedupe UNIQUE (ward_id, event_type, aggregate_id);


--
-- Name: event_outbox event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);


--
-- Name: global_event_outbox global_event_outbox_dedupe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_event_outbox
    ADD CONSTRAINT global_event_outbox_dedupe UNIQUE (event_type, aggregate_id);


--
-- Name: global_event_outbox global_event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_event_outbox
    ADD CONSTRAINT global_event_outbox_pkey PRIMARY KEY (id);


--
-- Name: global_notification_delivery global_notification_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_notification_delivery
    ADD CONSTRAINT global_notification_delivery_pkey PRIMARY KEY (id);


--
-- Name: global_notification_delivery global_notification_delivery_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_notification_delivery
    ADD CONSTRAINT global_notification_delivery_unique UNIQUE (global_event_outbox_id, recipient_user_id, channel);


--
-- Name: global_user_notification global_user_notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_user_notification
    ADD CONSTRAINT global_user_notification_pkey PRIMARY KEY (id);


--
-- Name: global_user_notification global_user_notification_recipient_event_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_user_notification
    ADD CONSTRAINT global_user_notification_recipient_event_unique UNIQUE (recipient_user_id, source_event_id);


--
-- Name: historical_import_name_review historical_import_name_review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_import_name_review
    ADD CONSTRAINT historical_import_name_review_pkey PRIMARY KEY (id);


--
-- Name: historical_import_name_review historical_import_name_review_ward_id_source_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_import_name_review
    ADD CONSTRAINT historical_import_name_review_ward_id_source_name_key UNIQUE (ward_id, source_name);


--
-- Name: hymn hymn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hymn
    ADD CONSTRAINT hymn_pkey PRIMARY KEY (id);


--
-- Name: import_run import_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_run
    ADD CONSTRAINT import_run_pkey PRIMARY KEY (id);


--
-- Name: internal_note internal_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_pkey PRIMARY KEY (id);


--
-- Name: interview_calendar_subscription interview_calendar_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_calendar_subscription
    ADD CONSTRAINT interview_calendar_subscription_pkey PRIMARY KEY (id);


--
-- Name: interview_calendar_subscription interview_calendar_subscription_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_calendar_subscription
    ADD CONSTRAINT interview_calendar_subscription_token_hash_key UNIQUE (token_hash);


--
-- Name: media_asset media_asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_pkey PRIMARY KEY (id);


--
-- Name: media_asset media_asset_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_public_token_key UNIQUE (public_token);


--
-- Name: media_asset media_asset_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_storage_key_key UNIQUE (storage_key);


--
-- Name: meeting_business_line meeting_business_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_business_line
    ADD CONSTRAINT meeting_business_line_pkey PRIMARY KEY (id);


--
-- Name: meeting_document meeting_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_pkey PRIMARY KEY (id);


--
-- Name: meeting_document meeting_document_ward_id_meeting_id_document_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_ward_id_meeting_id_document_type_key UNIQUE (ward_id, meeting_id, document_type);


--
-- Name: meeting_membership_ordinance meeting_membership_ordinance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_membership_ordinance
    ADD CONSTRAINT meeting_membership_ordinance_pkey PRIMARY KEY (id);


--
-- Name: meeting meeting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting
    ADD CONSTRAINT meeting_pkey PRIMARY KEY (id);


--
-- Name: meeting_program_item meeting_program_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_item
    ADD CONSTRAINT meeting_program_item_pkey PRIMARY KEY (id);


--
-- Name: meeting_program_render meeting_program_render_id_ward_meeting_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_id_ward_meeting_unique UNIQUE (id, ward_id, meeting_id);


--
-- Name: meeting_program_render meeting_program_render_meeting_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_meeting_id_version_key UNIQUE (meeting_id, version);


--
-- Name: meeting_program_render meeting_program_render_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_pkey PRIMARY KEY (id);


--
-- Name: meeting_technology_checklist meeting_technology_checklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_technology_checklist
    ADD CONSTRAINT meeting_technology_checklist_pkey PRIMARY KEY (id);


--
-- Name: meeting_technology_checklist meeting_technology_checklist_ward_id_meeting_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_technology_checklist
    ADD CONSTRAINT meeting_technology_checklist_ward_id_meeting_id_key UNIQUE (ward_id, meeting_id);


--
-- Name: meeting meeting_ward_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting
    ADD CONSTRAINT meeting_ward_id_unique UNIQUE (ward_id, id);


--
-- Name: member_note member_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_note
    ADD CONSTRAINT member_note_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery notification_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_pkey PRIMARY KEY (id);


--
-- Name: notification_email_digest_item notification_email_digest_delivery_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_delivery_unique UNIQUE (delivery_id);


--
-- Name: notification_email_digest_item notification_email_digest_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_item_pkey PRIMARY KEY (id);


--
-- Name: notification_email_preference notification_email_preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_preference
    ADD CONSTRAINT notification_email_preference_pkey PRIMARY KEY (id);


--
-- Name: notification_email_preference notification_email_preference_ward_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_preference
    ADD CONSTRAINT notification_email_preference_ward_user_unique UNIQUE (ward_id, user_id);


--
-- Name: notification_subscription notification_subscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_subscription
    ADD CONSTRAINT notification_subscription_pkey PRIMARY KEY (id);


--
-- Name: notification_subscription notification_subscription_ward_user_event_channel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_subscription
    ADD CONSTRAINT notification_subscription_ward_user_event_channel_unique UNIQUE (ward_id, user_id, event_type, channel);


--
-- Name: offline_mutation offline_mutation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutation
    ADD CONSTRAINT offline_mutation_pkey PRIMARY KEY (mutation_id);


--
-- Name: public_program_layout public_program_layout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_layout
    ADD CONSTRAINT public_program_layout_pkey PRIMARY KEY (id);


--
-- Name: public_program_layout public_program_layout_ward_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_layout
    ADD CONSTRAINT public_program_layout_ward_id_key UNIQUE (ward_id);


--
-- Name: public_program_portal public_program_portal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_portal
    ADD CONSTRAINT public_program_portal_pkey PRIMARY KEY (id);


--
-- Name: public_program_portal public_program_portal_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_portal
    ADD CONSTRAINT public_program_portal_token_key UNIQUE (token);


--
-- Name: public_program_portal public_program_portal_ward_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_portal
    ADD CONSTRAINT public_program_portal_ward_unique UNIQUE (ward_id);


--
-- Name: public_program_share public_program_share_meeting_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_meeting_unique UNIQUE (meeting_id);


--
-- Name: public_program_share public_program_share_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_pkey PRIMARY KEY (id);


--
-- Name: public_program_share public_program_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_token_key UNIQUE (token);


--
-- Name: role role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_name_key UNIQUE (name);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);


--
-- Name: scheduled_interview scheduled_interview_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_interview
    ADD CONSTRAINT scheduled_interview_pkey PRIMARY KEY (id);


--
-- Name: stake stake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake
    ADD CONSTRAINT stake_pkey PRIMARY KEY (id);


--
-- Name: stake_user_role stake_user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_pkey PRIMARY KEY (id);


--
-- Name: stake_user_role stake_user_role_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_unique UNIQUE (stake_id, user_id, role_id);


--
-- Name: standard_calling standard_calling_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_calling
    ADD CONSTRAINT standard_calling_name_key UNIQUE (name);


--
-- Name: standard_calling standard_calling_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standard_calling
    ADD CONSTRAINT standard_calling_pkey PRIMARY KEY (id);


--
-- Name: support_work_item support_work_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_work_item
    ADD CONSTRAINT support_work_item_pkey PRIMARY KEY (id);


--
-- Name: support_work_item support_work_item_source_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_work_item
    ADD CONSTRAINT support_work_item_source_unique UNIQUE (source_type, source_id);


--
-- Name: user_account user_account_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_email_key UNIQUE (email);


--
-- Name: user_account user_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_pkey PRIMARY KEY (id);


--
-- Name: user_global_role user_global_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_global_role
    ADD CONSTRAINT user_global_role_pkey PRIMARY KEY (id);


--
-- Name: user_global_role user_global_role_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_global_role
    ADD CONSTRAINT user_global_role_user_id_role_id_key UNIQUE (user_id, role_id);


--
-- Name: user_notification user_notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification
    ADD CONSTRAINT user_notification_pkey PRIMARY KEY (id);


--
-- Name: user_notification user_notification_recipient_event_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification
    ADD CONSTRAINT user_notification_recipient_event_unique UNIQUE (recipient_user_id, source_event_id);


--
-- Name: ward_document_settings ward_document_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_document_settings
    ADD CONSTRAINT ward_document_settings_pkey PRIMARY KEY (ward_id);


--
-- Name: ward_feature_settings ward_feature_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_feature_settings
    ADD CONSTRAINT ward_feature_settings_pkey PRIMARY KEY (ward_id);


--
-- Name: ward ward_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward
    ADD CONSTRAINT ward_pkey PRIMARY KEY (id);


--
-- Name: ward_stand_template ward_stand_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_stand_template
    ADD CONSTRAINT ward_stand_template_pkey PRIMARY KEY (id);


--
-- Name: ward_stand_template ward_stand_template_ward_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_stand_template
    ADD CONSTRAINT ward_stand_template_ward_id_key UNIQUE (ward_id);


--
-- Name: ward_user_role ward_user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_pkey PRIMARY KEY (id);


--
-- Name: ward_user_role ward_user_role_ward_id_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_ward_id_user_id_role_id_key UNIQUE (ward_id, user_id, role_id);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_action_idx ON public.audit_log USING btree (action);


--
-- Name: audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: audit_log_entity_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entity_type_idx ON public.audit_log USING btree (entity_type);


--
-- Name: audit_log_target_member_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_target_member_id_idx ON public.audit_log USING btree (target_member_id);


--
-- Name: audit_log_ward_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_ward_id_idx ON public.audit_log USING btree (ward_id);


--
-- Name: bishopric_action_ward_calling_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_action_ward_calling_idx ON public.bishopric_action USING btree (ward_id, calling_assignment_id);


--
-- Name: bishopric_action_ward_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_action_ward_due_idx ON public.bishopric_action USING btree (ward_id, due_date, status);


--
-- Name: bishopric_action_ward_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_action_ward_member_idx ON public.bishopric_action USING btree (ward_id, member_id);


--
-- Name: bishopric_action_ward_membership_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_action_ward_membership_action_idx ON public.bishopric_action USING btree (ward_id, linked_membership_action_id);


--
-- Name: bishopric_meeting_ward_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_meeting_ward_date_idx ON public.bishopric_meeting USING btree (ward_id, meeting_date DESC);


--
-- Name: bishopric_meeting_ward_type_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bishopric_meeting_ward_type_date_idx ON public.bishopric_meeting USING btree (ward_id, meeting_type, meeting_date DESC);


--
-- Name: calendar_event_cache_ward_starts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_event_cache_ward_starts_idx ON public.calendar_event_cache USING btree (ward_id, starts_at DESC);


--
-- Name: calling_assignment_member_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calling_assignment_member_id_idx ON public.calling_assignment USING btree (member_id);


--
-- Name: document_template_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_template_published_idx ON public.document_template USING btree (scope_type, scope_id, published_at);


--
-- Name: document_template_scope_status_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_template_scope_status_type_idx ON public.document_template USING btree (scope_type, scope_id, status, document_type);


--
-- Name: document_template_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_template_source_idx ON public.document_template USING btree (source_template_id, source_template_version);


--
-- Name: document_template_template_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_template_template_key_unique ON public.document_template USING btree (template_key) WHERE (template_key IS NOT NULL);


--
-- Name: document_template_version_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_template_version_source_idx ON public.document_template_version USING btree (template_id, version);


--
-- Name: document_template_version_template_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_template_version_template_created_idx ON public.document_template_version USING btree (template_id, created_at DESC);


--
-- Name: global_event_outbox_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX global_event_outbox_pending_idx ON public.global_event_outbox USING btree (status, available_at, created_at);


--
-- Name: global_notification_delivery_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX global_notification_delivery_status_idx ON public.global_notification_delivery USING btree (delivery_status, updated_at);


--
-- Name: global_user_notification_recipient_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX global_user_notification_recipient_created_idx ON public.global_user_notification USING btree (recipient_user_id, created_at DESC);


--
-- Name: historical_import_name_review_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historical_import_name_review_open_idx ON public.historical_import_name_review USING btree (ward_id, status, source_name);


--
-- Name: idx_hymn_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hymn_active ON public.hymn USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_hymn_book_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hymn_book_sort ON public.hymn USING btree (book, sort_key);


--
-- Name: internal_note_bishopric_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX internal_note_bishopric_action_idx ON public.internal_note USING btree (bishopric_action_id, created_at DESC) WHERE (bishopric_action_id IS NOT NULL);


--
-- Name: internal_note_meeting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX internal_note_meeting_idx ON public.internal_note USING btree (meeting_id, created_at DESC) WHERE (meeting_id IS NOT NULL);


--
-- Name: internal_note_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX internal_note_member_idx ON public.internal_note USING btree (member_id, created_at DESC) WHERE (member_id IS NOT NULL);


--
-- Name: internal_note_program_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX internal_note_program_item_idx ON public.internal_note USING btree (program_item_id, created_at DESC) WHERE (program_item_id IS NOT NULL);


--
-- Name: internal_note_public_program_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX internal_note_public_program_item_unique ON public.internal_note USING btree (program_item_id) WHERE ((visibility = 'PUBLIC'::text) AND (program_item_id IS NOT NULL));


--
-- Name: internal_note_ward_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX internal_note_ward_created_idx ON public.internal_note USING btree (ward_id, created_at DESC);


--
-- Name: interview_calendar_subscription_ward_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interview_calendar_subscription_ward_idx ON public.interview_calendar_subscription USING btree (ward_id) WHERE (revoked_at IS NULL);


--
-- Name: media_asset_scope_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_scope_status_created_idx ON public.media_asset USING btree (scope_type, status, created_at DESC);


--
-- Name: media_asset_ward_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_asset_ward_status_created_idx ON public.media_asset USING btree (ward_id, status, created_at DESC);


--
-- Name: meeting_business_line_follow_up_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_business_line_follow_up_idx ON public.meeting_business_line USING btree (ward_id, calling_assignment_id, action_type, status);


--
-- Name: meeting_document_ward_meeting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_document_ward_meeting_idx ON public.meeting_document USING btree (ward_id, meeting_id, document_type);


--
-- Name: meeting_membership_ordinance_follow_up_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_membership_ordinance_follow_up_idx ON public.meeting_membership_ordinance USING btree (ward_id, status, meeting_id, created_at);


--
-- Name: meeting_membership_ordinance_meeting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_membership_ordinance_meeting_idx ON public.meeting_membership_ordinance USING btree (ward_id, meeting_id, created_at);


--
-- Name: meeting_program_render_ward_meeting_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_program_render_ward_meeting_version_idx ON public.meeting_program_render USING btree (ward_id, meeting_id, version DESC);


--
-- Name: meeting_program_render_ward_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_program_render_ward_published_at_idx ON public.meeting_program_render USING btree (ward_id, meeting_id, published_at DESC NULLS LAST, version DESC);


--
-- Name: meeting_technology_checklist_ward_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meeting_technology_checklist_ward_idx ON public.meeting_technology_checklist USING btree (ward_id, updated_at DESC);


--
-- Name: member_ward_identity_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX member_ward_identity_key_unique ON public.member USING btree (ward_id, identity_key) WHERE (identity_key IS NOT NULL);


--
-- Name: notification_delivery_email_recipient_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_delivery_email_recipient_unique ON public.notification_delivery USING btree (event_outbox_id, channel, recipient_user_id) WHERE (channel = 'EMAIL'::text);


--
-- Name: notification_delivery_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_delivery_recipient_idx ON public.notification_delivery USING btree (ward_id, recipient_user_id, created_at DESC);


--
-- Name: notification_delivery_webhook_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_delivery_webhook_unique ON public.notification_delivery USING btree (event_outbox_id, channel) WHERE (channel = 'webhook'::text);


--
-- Name: notification_email_digest_recipient_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_digest_recipient_due_idx ON public.notification_email_digest_item USING btree (ward_id, recipient_user_id, digest_frequency, scheduled_for) WHERE (delivered_at IS NULL);


--
-- Name: notification_email_preference_ward_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_email_preference_ward_user_idx ON public.notification_email_preference USING btree (ward_id, user_id);


--
-- Name: notification_subscription_ward_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_subscription_ward_user_idx ON public.notification_subscription USING btree (ward_id, user_id);


--
-- Name: offline_mutation_meeting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_mutation_meeting_idx ON public.offline_mutation USING btree (meeting_id, created_at DESC);


--
-- Name: offline_mutation_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offline_mutation_user_idx ON public.offline_mutation USING btree (user_id, created_at DESC);


--
-- Name: public_program_share_token_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_program_share_token_expires_idx ON public.public_program_share USING btree (token, expires_at);


--
-- Name: public_program_share_ward_active_render_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_program_share_ward_active_render_idx ON public.public_program_share USING btree (ward_id, active_render_id);


--
-- Name: scheduled_interview_ward_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduled_interview_ward_time_idx ON public.scheduled_interview USING btree (ward_id, scheduled_at);


--
-- Name: stake_user_role_stake_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stake_user_role_stake_user_idx ON public.stake_user_role USING btree (stake_id, user_id);


--
-- Name: stake_user_role_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stake_user_role_user_active_idx ON public.stake_user_role USING btree (user_id, revoked_at);


--
-- Name: support_work_item_assignee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_work_item_assignee_idx ON public.support_work_item USING btree (assigned_to_user_id, status, updated_at DESC);


--
-- Name: support_work_item_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_work_item_queue_idx ON public.support_work_item USING btree (status, created_at DESC);


--
-- Name: support_work_item_reminder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_work_item_reminder_idx ON public.support_work_item USING btree (status, last_reminded_at, created_at);


--
-- Name: user_notification_recipient_ward_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_notification_recipient_ward_created_idx ON public.user_notification USING btree (recipient_user_id, ward_id, created_at DESC);


--
-- Name: user_notification_recipient_ward_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_notification_recipient_ward_read_idx ON public.user_notification USING btree (recipient_user_id, ward_id, read_at);


--
-- Name: ward_user_role_active_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ward_user_role_active_assignment_idx ON public.ward_user_role USING btree (user_id, ward_id, created_at) WHERE (revoked_at IS NULL);


--
-- Name: ward_user_role_support_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ward_user_role_support_assignment_idx ON public.ward_user_role USING btree (user_id, ward_id, expires_at) WHERE (is_support_assignment = true);


--
-- Name: document_template document_template_lineage_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_template_lineage_validate BEFORE INSERT OR UPDATE OF source_template_id, source_template_version ON public.document_template FOR EACH ROW EXECUTE FUNCTION app.validate_document_template_lineage();


--
-- Name: document_template document_template_scope_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_template_scope_validate BEFORE INSERT OR UPDATE OF scope_type, scope_id, created_by_user_id ON public.document_template FOR EACH ROW EXECUTE FUNCTION app.validate_document_template_scope();


--
-- Name: document_template_version document_template_version_published_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_template_version_published_immutable BEFORE DELETE OR UPDATE ON public.document_template_version FOR EACH ROW EXECUTE FUNCTION app.prevent_published_template_version_mutation();


--
-- Name: media_asset media_asset_immutable_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER media_asset_immutable_fields BEFORE UPDATE ON public.media_asset FOR EACH ROW EXECUTE FUNCTION public.media_asset_immutable_fields();


--
-- Name: meeting_program_render meeting_program_render_print_inputs_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER meeting_program_render_print_inputs_immutable BEFORE UPDATE ON public.meeting_program_render FOR EACH ROW EXECUTE FUNCTION public.prevent_published_print_input_mutation();


--
-- Name: meeting_program_render meeting_program_render_publication_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER meeting_program_render_publication_immutable BEFORE UPDATE ON public.meeting_program_render FOR EACH ROW EXECUTE FUNCTION public.prevent_published_render_publication_mutation();


--
-- Name: meeting_program_render meeting_program_render_published_delete_protected; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER meeting_program_render_published_delete_protected BEFORE DELETE ON public.meeting_program_render FOR EACH ROW EXECUTE FUNCTION public.prevent_published_render_publication_mutation();


--
-- Name: public_program_share public_program_share_active_render_published_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER public_program_share_active_render_published_guard BEFORE INSERT OR UPDATE ON public.public_program_share FOR EACH ROW EXECUTE FUNCTION public.validate_public_program_share_active_render();


--
-- Name: announcement announcement_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: bishopric_action bishopric_action_bishopric_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_bishopric_meeting_id_fkey FOREIGN KEY (bishopric_meeting_id) REFERENCES public.bishopric_meeting(id) ON DELETE CASCADE;


--
-- Name: bishopric_action bishopric_action_calling_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_calling_assignment_id_fkey FOREIGN KEY (calling_assignment_id) REFERENCES public.calling_assignment(id) ON DELETE SET NULL;


--
-- Name: bishopric_action bishopric_action_completed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: bishopric_action bishopric_action_linked_membership_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_linked_membership_action_id_fkey FOREIGN KEY (linked_membership_action_id) REFERENCES public.meeting_membership_ordinance(id) ON DELETE SET NULL;


--
-- Name: bishopric_action bishopric_action_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- Name: bishopric_action bishopric_action_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_action
    ADD CONSTRAINT bishopric_action_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: bishopric_meeting bishopric_meeting_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_meeting
    ADD CONSTRAINT bishopric_meeting_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: bishopric_meeting bishopric_meeting_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bishopric_meeting
    ADD CONSTRAINT bishopric_meeting_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: calendar_event_cache calendar_event_cache_calendar_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_cache
    ADD CONSTRAINT calendar_event_cache_calendar_feed_id_fkey FOREIGN KEY (calendar_feed_id) REFERENCES public.calendar_feed(id) ON DELETE CASCADE;


--
-- Name: calendar_event_cache calendar_event_cache_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_cache
    ADD CONSTRAINT calendar_event_cache_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: calendar_feed calendar_feed_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_feed
    ADD CONSTRAINT calendar_feed_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: calling_action calling_action_calling_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_action
    ADD CONSTRAINT calling_action_calling_assignment_id_fkey FOREIGN KEY (calling_assignment_id) REFERENCES public.calling_assignment(id) ON DELETE CASCADE;


--
-- Name: calling_action calling_action_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_action
    ADD CONSTRAINT calling_action_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: calling_assignment calling_assignment_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_assignment
    ADD CONSTRAINT calling_assignment_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- Name: calling_assignment calling_assignment_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calling_assignment
    ADD CONSTRAINT calling_assignment_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: document_template document_template_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: document_template document_template_current_published_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_current_published_version_fk FOREIGN KEY (current_published_version_id, id) REFERENCES public.document_template_version(id, template_id) ON DELETE SET NULL;


--
-- Name: document_template document_template_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_current_version_fk FOREIGN KEY (current_published_version_id) REFERENCES public.document_template_version(id) ON DELETE SET NULL;


--
-- Name: document_template document_template_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: document_template document_template_source_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template
    ADD CONSTRAINT document_template_source_fk FOREIGN KEY (source_template_id, source_template_version) REFERENCES public.document_template_version(template_id, version) ON DELETE SET NULL;


--
-- Name: document_template_version document_template_version_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template_version
    ADD CONSTRAINT document_template_version_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: document_template_version document_template_version_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_template_version
    ADD CONSTRAINT document_template_version_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_template(id) ON DELETE CASCADE;


--
-- Name: event_outbox event_outbox_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: global_notification_delivery global_notification_delivery_global_event_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_notification_delivery
    ADD CONSTRAINT global_notification_delivery_global_event_outbox_id_fkey FOREIGN KEY (global_event_outbox_id) REFERENCES public.global_event_outbox(id) ON DELETE CASCADE;


--
-- Name: global_notification_delivery global_notification_delivery_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_notification_delivery
    ADD CONSTRAINT global_notification_delivery_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: global_user_notification global_user_notification_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_user_notification
    ADD CONSTRAINT global_user_notification_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: global_user_notification global_user_notification_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_user_notification
    ADD CONSTRAINT global_user_notification_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.global_event_outbox(id) ON DELETE CASCADE;


--
-- Name: historical_import_name_review historical_import_name_review_matched_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_import_name_review
    ADD CONSTRAINT historical_import_name_review_matched_member_id_fkey FOREIGN KEY (matched_member_id) REFERENCES public.member(id) ON DELETE SET NULL;


--
-- Name: historical_import_name_review historical_import_name_review_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_import_name_review
    ADD CONSTRAINT historical_import_name_review_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: import_run import_run_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_run
    ADD CONSTRAINT import_run_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: import_run import_run_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_run
    ADD CONSTRAINT import_run_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: internal_note internal_note_bishopric_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_bishopric_action_id_fkey FOREIGN KEY (bishopric_action_id) REFERENCES public.bishopric_action(id) ON DELETE CASCADE;


--
-- Name: internal_note internal_note_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: internal_note internal_note_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: internal_note internal_note_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: internal_note internal_note_program_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_program_item_id_fkey FOREIGN KEY (program_item_id) REFERENCES public.meeting_program_item(id) ON DELETE CASCADE;


--
-- Name: internal_note internal_note_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_note
    ADD CONSTRAINT internal_note_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: interview_calendar_subscription interview_calendar_subscription_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_calendar_subscription
    ADD CONSTRAINT interview_calendar_subscription_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: interview_calendar_subscription interview_calendar_subscription_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_calendar_subscription
    ADD CONSTRAINT interview_calendar_subscription_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: media_asset media_asset_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id);


--
-- Name: media_asset media_asset_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: media_asset media_asset_stake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.stake(id) ON DELETE CASCADE;


--
-- Name: media_asset media_asset_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_business_line meeting_business_line_calling_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_business_line
    ADD CONSTRAINT meeting_business_line_calling_assignment_id_fkey FOREIGN KEY (calling_assignment_id) REFERENCES public.calling_assignment(id) ON DELETE CASCADE;


--
-- Name: meeting_business_line meeting_business_line_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_business_line
    ADD CONSTRAINT meeting_business_line_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_business_line meeting_business_line_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_business_line
    ADD CONSTRAINT meeting_business_line_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_document meeting_document_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_document meeting_document_source_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_source_template_id_fkey FOREIGN KEY (source_template_id) REFERENCES public.document_template(id) ON DELETE SET NULL;


--
-- Name: meeting_document meeting_document_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: meeting_document meeting_document_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_document
    ADD CONSTRAINT meeting_document_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_membership_ordinance meeting_membership_ordinance_completed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_membership_ordinance
    ADD CONSTRAINT meeting_membership_ordinance_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: meeting_membership_ordinance meeting_membership_ordinance_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_membership_ordinance
    ADD CONSTRAINT meeting_membership_ordinance_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_membership_ordinance meeting_membership_ordinance_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_membership_ordinance
    ADD CONSTRAINT meeting_membership_ordinance_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_program_item meeting_program_item_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_item
    ADD CONSTRAINT meeting_program_item_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_program_item meeting_program_item_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_item
    ADD CONSTRAINT meeting_program_item_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_program_render meeting_program_render_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_program_render meeting_program_render_published_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_published_by_user_id_fkey FOREIGN KEY (published_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: meeting_program_render meeting_program_render_source_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_source_template_fk FOREIGN KEY (source_template_id) REFERENCES public.document_template(id) ON DELETE SET NULL;


--
-- Name: meeting_program_render meeting_program_render_source_template_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_source_template_version_fk FOREIGN KEY (source_template_id, source_template_version) REFERENCES public.document_template_version(template_id, version) ON DELETE SET NULL;


--
-- Name: meeting_program_render meeting_program_render_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_program_render
    ADD CONSTRAINT meeting_program_render_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting_technology_checklist meeting_technology_checklist_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_technology_checklist
    ADD CONSTRAINT meeting_technology_checklist_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: meeting_technology_checklist meeting_technology_checklist_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_technology_checklist
    ADD CONSTRAINT meeting_technology_checklist_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: meeting meeting_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting
    ADD CONSTRAINT meeting_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: member_note member_note_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_note
    ADD CONSTRAINT member_note_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: member_note member_note_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_note
    ADD CONSTRAINT member_note_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.member(id) ON DELETE CASCADE;


--
-- Name: member_note member_note_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_note
    ADD CONSTRAINT member_note_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: member member_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: notification_delivery notification_delivery_event_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_event_outbox_id_fkey FOREIGN KEY (event_outbox_id) REFERENCES public.event_outbox(id) ON DELETE CASCADE;


--
-- Name: notification_delivery notification_delivery_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: notification_delivery notification_delivery_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery
    ADD CONSTRAINT notification_delivery_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: notification_email_digest_item notification_email_digest_item_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_item_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.notification_delivery(id) ON DELETE CASCADE;


--
-- Name: notification_email_digest_item notification_email_digest_item_event_outbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_item_event_outbox_id_fkey FOREIGN KEY (event_outbox_id) REFERENCES public.event_outbox(id) ON DELETE CASCADE;


--
-- Name: notification_email_digest_item notification_email_digest_item_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_item_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: notification_email_digest_item notification_email_digest_item_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_digest_item
    ADD CONSTRAINT notification_email_digest_item_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: notification_email_preference notification_email_preference_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_preference
    ADD CONSTRAINT notification_email_preference_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: notification_email_preference notification_email_preference_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_email_preference
    ADD CONSTRAINT notification_email_preference_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: notification_subscription notification_subscription_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_subscription
    ADD CONSTRAINT notification_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: notification_subscription notification_subscription_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_subscription
    ADD CONSTRAINT notification_subscription_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: offline_mutation offline_mutation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutation
    ADD CONSTRAINT offline_mutation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: offline_mutation offline_mutation_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_mutation
    ADD CONSTRAINT offline_mutation_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: public_program_layout public_program_layout_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_layout
    ADD CONSTRAINT public_program_layout_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: public_program_layout public_program_layout_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_layout
    ADD CONSTRAINT public_program_layout_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: public_program_portal public_program_portal_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_portal
    ADD CONSTRAINT public_program_portal_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: public_program_share public_program_share_active_render_same_meeting_ward_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_active_render_same_meeting_ward_fk FOREIGN KEY (active_render_id, ward_id, meeting_id) REFERENCES public.meeting_program_render(id, ward_id, meeting_id) ON DELETE RESTRICT;


--
-- Name: public_program_share public_program_share_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meeting(id) ON DELETE CASCADE;


--
-- Name: public_program_share public_program_share_meeting_same_ward_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_meeting_same_ward_fk FOREIGN KEY (ward_id, meeting_id) REFERENCES public.meeting(ward_id, id);


--
-- Name: public_program_share public_program_share_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_program_share
    ADD CONSTRAINT public_program_share_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: scheduled_interview scheduled_interview_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_interview
    ADD CONSTRAINT scheduled_interview_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: scheduled_interview scheduled_interview_linked_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_interview
    ADD CONSTRAINT scheduled_interview_linked_action_id_fkey FOREIGN KEY (linked_action_id) REFERENCES public.meeting_membership_ordinance(id) ON DELETE SET NULL;


--
-- Name: scheduled_interview scheduled_interview_linked_calling_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_interview
    ADD CONSTRAINT scheduled_interview_linked_calling_id_fkey FOREIGN KEY (linked_calling_id) REFERENCES public.calling_assignment(id) ON DELETE SET NULL;


--
-- Name: scheduled_interview scheduled_interview_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_interview
    ADD CONSTRAINT scheduled_interview_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: stake_user_role stake_user_role_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: stake_user_role stake_user_role_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: stake_user_role stake_user_role_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;


--
-- Name: stake_user_role stake_user_role_stake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.stake(id) ON DELETE CASCADE;


--
-- Name: stake_user_role stake_user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stake_user_role
    ADD CONSTRAINT stake_user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: support_work_item support_work_item_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_work_item
    ADD CONSTRAINT support_work_item_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: user_global_role user_global_role_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_global_role
    ADD CONSTRAINT user_global_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;


--
-- Name: user_global_role user_global_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_global_role
    ADD CONSTRAINT user_global_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_notification user_notification_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification
    ADD CONSTRAINT user_notification_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: user_notification user_notification_source_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification
    ADD CONSTRAINT user_notification_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES public.event_outbox(id) ON DELETE CASCADE;


--
-- Name: user_notification user_notification_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification
    ADD CONSTRAINT user_notification_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: ward_document_settings ward_document_settings_default_sacrament_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_document_settings
    ADD CONSTRAINT ward_document_settings_default_sacrament_template_id_fkey FOREIGN KEY (default_sacrament_template_id) REFERENCES public.document_template(id) ON DELETE SET NULL;


--
-- Name: ward_document_settings ward_document_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_document_settings
    ADD CONSTRAINT ward_document_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: ward_document_settings ward_document_settings_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_document_settings
    ADD CONSTRAINT ward_document_settings_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: ward_feature_settings ward_feature_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_feature_settings
    ADD CONSTRAINT ward_feature_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: ward_feature_settings ward_feature_settings_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_feature_settings
    ADD CONSTRAINT ward_feature_settings_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: ward ward_stake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward
    ADD CONSTRAINT ward_stake_id_fkey FOREIGN KEY (stake_id) REFERENCES public.stake(id) ON DELETE CASCADE;


--
-- Name: ward_stand_template ward_stand_template_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_stand_template
    ADD CONSTRAINT ward_stand_template_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: ward_user_role ward_user_role_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: ward_user_role ward_user_role_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;


--
-- Name: ward_user_role ward_user_role_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(id) ON DELETE CASCADE;


--
-- Name: ward_user_role ward_user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_account(id) ON DELETE CASCADE;


--
-- Name: ward_user_role ward_user_role_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ward_user_role
    ADD CONSTRAINT ward_user_role_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.ward(id) ON DELETE CASCADE;


--
-- Name: announcement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_isolation ON public.audit_log USING (((ward_id = app.current_ward_id()) OR (ward_id IS NULL)));


--
-- Name: audit_log audit_log_support_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_support_admin ON public.audit_log USING (app.is_support_admin()) WITH CHECK (app.is_support_admin());


--
-- Name: calendar_event_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_event_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_feed; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_feed ENABLE ROW LEVEL SECURITY;

--
-- Name: calling_action; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calling_action ENABLE ROW LEVEL SECURITY;

--
-- Name: calling_assignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calling_assignment ENABLE ROW LEVEL SECURITY;

--
-- Name: document_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_template ENABLE ROW LEVEL SECURITY;

--
-- Name: document_template document_template_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_template_read ON public.document_template FOR SELECT USING ((((scope_type = 'SYSTEM'::text) AND (status = 'PUBLISHED'::text)) OR app.can_administer_system_templates() OR ((scope_type = 'STAKE'::text) AND (app.is_stake_admin(scope_id) OR ((status = 'PUBLISHED'::text) AND (EXISTS ( SELECT 1
   FROM public.ward w
  WHERE ((w.id = app.current_ward_id()) AND (w.stake_id = document_template.scope_id))))))) OR ((scope_type = 'WARD'::text) AND (scope_id = app.current_ward_id())) OR ((scope_type = 'PERSONAL_DRAFT'::text) AND (scope_id = app.current_ward_id()) AND (created_by_user_id = app.current_user_id()))));


--
-- Name: document_template_version; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_template_version ENABLE ROW LEVEL SECURITY;

--
-- Name: document_template_version document_template_version_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_template_version_read ON public.document_template_version FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.document_template t
  WHERE ((t.id = document_template_version.template_id) AND (app.can_administer_system_templates() OR ((t.scope_type = 'SYSTEM'::text) AND (t.status = 'PUBLISHED'::text)) OR ((t.scope_type = 'STAKE'::text) AND (app.is_stake_admin(t.scope_id) OR ((t.status = 'PUBLISHED'::text) AND (EXISTS ( SELECT 1
           FROM public.ward w
          WHERE ((w.id = app.current_ward_id()) AND (w.stake_id = t.scope_id))))))) OR ((t.scope_type = 'WARD'::text) AND (t.scope_id = app.current_ward_id())) OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND (t.scope_id = app.current_ward_id()) AND (t.created_by_user_id = app.current_user_id())))))));


--
-- Name: document_template_version document_template_version_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_template_version_write ON public.document_template_version USING ((EXISTS ( SELECT 1
   FROM public.document_template t
  WHERE ((t.id = document_template_version.template_id) AND (((t.scope_type = 'SYSTEM'::text) AND app.can_administer_system_templates()) OR ((t.scope_type = 'STAKE'::text) AND app.is_stake_admin(t.scope_id)) OR ((t.scope_type = 'WARD'::text) AND (t.scope_id = app.current_ward_id())) OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND (t.scope_id = app.current_ward_id()) AND (t.created_by_user_id = app.current_user_id()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.document_template t
  WHERE ((t.id = document_template_version.template_id) AND (((t.scope_type = 'SYSTEM'::text) AND app.can_administer_system_templates()) OR ((t.scope_type = 'STAKE'::text) AND app.is_stake_admin(t.scope_id)) OR ((t.scope_type = 'WARD'::text) AND (t.scope_id = app.current_ward_id())) OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND (t.scope_id = app.current_ward_id()) AND (t.created_by_user_id = app.current_user_id())))))));


--
-- Name: document_template document_template_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_template_write ON public.document_template USING ((((scope_type = 'STAKE'::text) AND app.is_stake_admin(scope_id)) OR ((scope_type = 'SYSTEM'::text) AND app.can_administer_system_templates()) OR ((scope_type = 'WARD'::text) AND (scope_id = app.current_ward_id())) OR ((scope_type = 'PERSONAL_DRAFT'::text) AND (scope_id = app.current_ward_id()) AND (created_by_user_id = app.current_user_id())))) WITH CHECK ((((scope_type = 'SYSTEM'::text) AND app.can_administer_system_templates()) OR ((scope_type = 'STAKE'::text) AND app.is_stake_admin(scope_id)) OR ((scope_type = 'WARD'::text) AND (scope_id = app.current_ward_id())) OR ((scope_type = 'PERSONAL_DRAFT'::text) AND (scope_id = app.current_ward_id()) AND (created_by_user_id = app.current_user_id()))));


--
-- Name: event_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: historical_import_name_review; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historical_import_name_review ENABLE ROW LEVEL SECURITY;

--
-- Name: historical_import_name_review historical_import_name_review_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY historical_import_name_review_isolation ON public.historical_import_name_review USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: import_run; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_run ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_note ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_note internal_note_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_note_isolation ON public.internal_note USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: interview_calendar_subscription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interview_calendar_subscription ENABLE ROW LEVEL SECURITY;

--
-- Name: interview_calendar_subscription interview_calendar_subscription_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY interview_calendar_subscription_isolation ON public.interview_calendar_subscription USING (((ward_id = app.current_ward_id()) OR (token_hash = NULLIF(current_setting('app.interview_calendar_token_hash'::text, true), ''::text)))) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: media_asset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_asset ENABLE ROW LEVEL SECURITY;

--
-- Name: media_asset media_asset_archive; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_asset_archive ON public.media_asset FOR DELETE USING (false);


--
-- Name: media_asset media_asset_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_asset_read ON public.media_asset FOR SELECT USING (((status = 'ACTIVE'::text) AND ((scope_type = 'SYSTEM'::text) OR ((scope_type = 'WARD'::text) AND (ward_id = app.current_ward_id())) OR ((scope_type = 'STAKE'::text) AND (stake_id = ( SELECT w.stake_id
   FROM public.ward w
  WHERE (w.id = app.current_ward_id())))))));


--
-- Name: media_asset media_asset_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_asset_update ON public.media_asset FOR UPDATE USING (false) WITH CHECK (false);


--
-- Name: media_asset media_asset_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_asset_write ON public.media_asset FOR INSERT WITH CHECK (((scope_type = 'WARD'::text) AND (ward_id = app.current_ward_id()) AND (created_by_user_id = app.current_user_id())));


--
-- Name: meeting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_business_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_business_line ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_document; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_document ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_document meeting_document_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_document_isolation ON public.meeting_document USING (((ward_id = app.current_ward_id()) AND (EXISTS ( SELECT 1
   FROM public.meeting m
  WHERE ((m.id = meeting_document.meeting_id) AND (m.ward_id = meeting_document.ward_id)))))) WITH CHECK (((ward_id = app.current_ward_id()) AND (EXISTS ( SELECT 1
   FROM public.meeting m
  WHERE ((m.id = meeting_document.meeting_id) AND (m.ward_id = meeting_document.ward_id))))));


--
-- Name: meeting_program_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_program_item ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_program_render; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_program_render ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_program_render meeting_program_render_public_token_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_program_render_public_token_read ON public.meeting_program_render FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.public_program_share pps
  WHERE ((pps.meeting_id = meeting_program_render.meeting_id) AND (pps.token = app.current_public_meeting_token())))));


--
-- Name: meeting meeting_public_token_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_public_token_read ON public.meeting FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.public_program_share pps
  WHERE ((pps.meeting_id = meeting.id) AND (pps.token = app.current_public_meeting_token())))));


--
-- Name: member; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member ENABLE ROW LEVEL SECURITY;

--
-- Name: member_note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_note ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_delivery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_delivery ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_email_digest_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_email_digest_item ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_email_digest_item notification_email_digest_item_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_email_digest_item_isolation ON public.notification_email_digest_item USING (((ward_id = app.current_ward_id()) AND ((recipient_user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid)))) WITH CHECK (((ward_id = app.current_ward_id()) AND ((recipient_user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid))));


--
-- Name: notification_email_preference; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_email_preference ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_email_preference notification_email_preference_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_email_preference_isolation ON public.notification_email_preference USING (((ward_id = app.current_ward_id()) AND ((user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid)))) WITH CHECK (((ward_id = app.current_ward_id()) AND ((user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid))));


--
-- Name: notification_subscription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_subscription ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_subscription notification_subscription_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_subscription_isolation ON public.notification_subscription USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: offline_mutation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_mutation ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_mutation offline_mutation_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offline_mutation_isolation ON public.offline_mutation USING (((ward_id = app.current_ward_id()) AND (user_id = app.current_user_id()))) WITH CHECK (((ward_id = app.current_ward_id()) AND (user_id = app.current_user_id())));


--
-- Name: announcement p0_announcement_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_announcement_ward_isolation ON public.announcement USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: calendar_event_cache p0_calendar_event_cache_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_calendar_event_cache_ward_isolation ON public.calendar_event_cache USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: calendar_feed p0_calendar_feed_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_calendar_feed_ward_isolation ON public.calendar_feed USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: calling_action p0_calling_action_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_calling_action_ward_isolation ON public.calling_action USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: calling_assignment p0_calling_assignment_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_calling_assignment_ward_isolation ON public.calling_assignment USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: event_outbox p0_event_outbox_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_event_outbox_ward_isolation ON public.event_outbox USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: import_run p0_import_run_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_import_run_ward_isolation ON public.import_run USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: meeting_business_line p0_meeting_business_line_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_business_line_ward_isolation ON public.meeting_business_line USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: meeting_program_item p0_meeting_program_item_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_program_item_ward_isolation ON public.meeting_program_item USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: meeting_program_render p0_meeting_program_render_public_portal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_program_render_public_portal_read ON public.meeting_program_render FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.public_program_portal portal
  WHERE ((portal.ward_id = meeting_program_render.ward_id) AND (portal.token = app.current_public_portal_token())))));


--
-- Name: meeting_program_render p0_meeting_program_render_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_program_render_ward_isolation ON public.meeting_program_render USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: meeting p0_meeting_public_portal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_public_portal_read ON public.meeting FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.public_program_portal portal
  WHERE ((portal.ward_id = meeting.ward_id) AND (portal.token = app.current_public_portal_token())))));


--
-- Name: meeting p0_meeting_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_meeting_ward_isolation ON public.meeting USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: member_note p0_member_note_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_member_note_ward_isolation ON public.member_note USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: member p0_member_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_member_ward_isolation ON public.member USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: notification_delivery p0_notification_delivery_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_notification_delivery_ward_isolation ON public.notification_delivery USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: public_program_portal p0_public_program_portal_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_public_program_portal_ward_isolation ON public.public_program_portal USING (((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)) OR (token = app.current_public_portal_token()))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: public_program_share p0_public_program_share_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_public_program_share_ward_isolation ON public.public_program_share USING (((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)) OR (token = app.current_public_meeting_token()) OR (EXISTS ( SELECT 1
   FROM public.public_program_portal portal
  WHERE ((portal.ward_id = public_program_share.ward_id) AND (portal.token = app.current_public_portal_token())))))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: ward_stand_template p0_ward_stand_template_ward_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p0_ward_stand_template_ward_isolation ON public.ward_stand_template USING ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id))) WITH CHECK ((((ward_id)::text = NULLIF(current_setting('app.ward_id'::text, true), ''::text)) AND app.has_active_ward_access(ward_id)));


--
-- Name: public_program_portal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_program_portal ENABLE ROW LEVEL SECURITY;

--
-- Name: public_program_share; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_program_share ENABLE ROW LEVEL SECURITY;

--
-- Name: stake_user_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stake_user_role ENABLE ROW LEVEL SECURITY;

--
-- Name: stake_user_role stake_user_role_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stake_user_role_read ON public.stake_user_role FOR SELECT USING (((user_id = app.current_user_id()) OR app.is_system_admin() OR app.is_stake_admin(stake_id)));


--
-- Name: stake_user_role stake_user_role_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stake_user_role_write ON public.stake_user_role USING ((app.is_system_admin() OR app.is_stake_admin(stake_id))) WITH CHECK (((app.is_system_admin() OR app.is_stake_admin(stake_id)) AND (EXISTS ( SELECT 1
   FROM public.role target
  WHERE ((target.id = stake_user_role.role_id) AND (target.name = 'STAKE_ADMIN'::text) AND (target.scope = 'STAKE'::text))))));


--
-- Name: user_notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notification user_notification_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_notification_isolation ON public.user_notification USING (((ward_id = app.current_ward_id()) AND ((recipient_user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid)))) WITH CHECK (((ward_id = app.current_ward_id()) AND ((recipient_user_id = app.current_user_id()) OR (app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid))));


--
-- Name: ward_document_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ward_document_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_document_settings ward_document_settings_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ward_document_settings_isolation ON public.ward_document_settings USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: ward_feature_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ward_feature_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_feature_settings ward_feature_settings_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ward_feature_settings_isolation ON public.ward_feature_settings USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: ward_stand_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ward_stand_template ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_user_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ward_user_role ENABLE ROW LEVEL SECURITY;

--
-- Name: ward_user_role ward_user_role_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ward_user_role_isolation ON public.ward_user_role USING ((ward_id = app.current_ward_id())) WITH CHECK ((ward_id = app.current_ward_id()));


--
-- Name: ward_user_role ward_user_role_self_lookup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ward_user_role_self_lookup ON public.ward_user_role FOR SELECT USING ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid));


--
-- Name: ward_user_role ward_user_role_support_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ward_user_role_support_admin ON public.ward_user_role USING (app.is_support_admin()) WITH CHECK (app.is_support_admin());


--
-- PostgreSQL database dump complete
