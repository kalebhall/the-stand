
# SCHEMA.md — The Stand (Master Database Schema Specification)

This document defines the complete relational database schema for The Stand,
including tables, key fields, relationships, indexes, constraints, and
Row Level Security (RLS) enforcement requirements.

PostgreSQL 15+ required.

====================================================================
GLOBAL DESIGN PRINCIPLES
====================================================================

1. Every ward-scoped table MUST include:
   - ward_id UUID NOT NULL
   - RLS enabled
   - Explicit RLS policies

2. All primary keys use UUID (gen_random_uuid()).

3. All timestamps use:
   - created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   - updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

4. Soft delete preferred where historical integrity matters.

5. No cross-ward foreign keys allowed without ward_id.

====================================================================
CORE TENANCY TABLES
====================================================================

-- stake
CREATE TABLE stake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ward
CREATE TABLE ward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stake_id UUID NOT NULL REFERENCES stake(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

====================================================================
USER & AUTH TABLES
====================================================================

-- user_account
CREATE TABLE user_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  last_password_change_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- role
CREATE TABLE role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('GLOBAL','WARD'))
);

-- ward_user_role
CREATE TABLE ward_user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, user_id, role_id)
);

ALTER TABLE ward_user_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY ward_user_role_isolation
ON ward_user_role
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
MEETINGS
====================================================================

CREATE TABLE meeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  meeting_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meeting ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_isolation
ON meeting
USING (ward_id = current_setting('app.ward_id')::uuid);

-- meeting_program_item
CREATE TABLE meeting_program_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meeting_program_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_program_item_isolation
ON meeting_program_item
USING (ward_id = current_setting('app.ward_id')::uuid);

-- meeting_program_render (immutable snapshot)
CREATE TABLE meeting_program_render (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  render_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, version)
);

ALTER TABLE meeting_program_render ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_program_render_isolation
ON meeting_program_render
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
BUSINESS LINES
====================================================================

CREATE TABLE meeting_business_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  calling_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('SUSTAIN','RELEASE')),
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meeting_business_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_business_line_isolation
ON meeting_business_line
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
CALLINGS
====================================================================

CREATE TABLE calling_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  member_name TEXT NOT NULL,
  calling_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calling_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY calling_assignment_isolation
ON calling_assignment
USING (ward_id = current_setting('app.ward_id')::uuid);

CREATE TABLE calling_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  calling_assignment_id UUID REFERENCES calling_assignment(id),
  action_status TEXT NOT NULL CHECK (action_status IN
    ('PROPOSED','EXTENDED','SUSTAINED','SET_APART')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calling_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY calling_action_isolation
ON calling_action
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
PUBLIC PROGRAM TOKENS
====================================================================

CREATE TABLE public_program_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public_program_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_program_share_isolation
ON public_program_share
USING (ward_id = current_setting('app.ward_id')::uuid);

CREATE TABLE public_program_portal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public_program_portal ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_program_portal_isolation
ON public_program_portal
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
ANNOUNCEMENTS
====================================================================

CREATE TABLE announcement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  start_date DATE,
  end_date DATE,
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;

CREATE POLICY announcement_isolation
ON announcement
USING (ward_id = current_setting('app.ward_id')::uuid);

====================================================================
OUTBOX & NOTIFICATIONS
====================================================================

CREATE TABLE event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_outbox_isolation
ON event_outbox
USING (ward_id = current_setting('app.ward_id')::uuid);

CREATE TABLE notification_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID REFERENCES event_outbox(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

====================================================================
AUDIT LOG
====================================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

====================================================================
MANDATORY RLS CONFIGURATION STEP
====================================================================

Each request must execute:

SET LOCAL app.user_id = '<user_uuid>';
SET LOCAL app.ward_id = '<ward_uuid>';

Failure to set ward context must result in no data visibility.

====================================================================
FINAL RULE
====================================================================

If any table that contains ward data:
- Lacks ward_id
- Lacks RLS
- Lacks policy

The migration is invalid and must be corrected.

====================================================================
END OF SCHEMA.md
====================================================================
