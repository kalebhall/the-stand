import type { PoolClient } from 'pg';

export type ReportFilters = {
  wardId: string;
  from: string | null;
  to: string | null;
};

export type SpeakerReportRow = {
  speakerName: string;
  talkCount: number;
  lastTalkDate: string;
};

export type TopicReportRow = {
  topic: string;
  speakerName: string;
  meetingDate: string;
};

export type HymnReportRow = {
  hymnNumber: string;
  hymnTitle: string;
  position: string;
  useCount: number;
  lastUsedDate: string;
};

export type PrayerReportRow = {
  personName: string;
  prayerType: string;
  assignmentCount: number;
  lastAssignmentDate: string;
};

export type CompletenessWarning = {
  meetingDate: string;
  itemType: string;
  title: string;
  issue: string;
};

export type ReportData = {
  speakers: SpeakerReportRow[];
  topics: TopicReportRow[];
  hymns: HymnReportRow[];
  prayers: PrayerReportRow[];
  completeness: CompletenessWarning[];
};

type RawReportRow = Record<string, unknown>;

function text(row: RawReportRow, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function count(row: RawReportRow): number {
  const value = row.count;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function dateRange(filters: ReportFilters): [string, string | null, string | null] {
  return [filters.wardId, filters.from, filters.to];
}

export async function loadReportData(client: PoolClient, filters: ReportFilters): Promise<ReportData> {
  const params = dateRange(filters);
  const [speakerResult, topicResult, hymnResult, prayerResult, completenessResult] = await Promise.all([
    client.query(
      `SELECT COALESCE(NULLIF(trim(i.title), ''), 'Unassigned speaker') AS speaker_name,
              COUNT(*)::int AS count,
              MAX(m.meeting_date)::text AS last_talk_date
         FROM meeting_program_item i
         JOIN meeting m ON m.id = i.meeting_id AND m.ward_id = $1::uuid
        WHERE i.ward_id = $1::uuid
          AND i.item_type = 'SPEAKER'
          AND ($2::date IS NULL OR m.meeting_date >= $2::date)
          AND ($3::date IS NULL OR m.meeting_date <= $3::date)
        GROUP BY COALESCE(NULLIF(trim(i.title), ''), 'Unassigned speaker')
        ORDER BY MAX(m.meeting_date) DESC, COUNT(*) DESC`,
      params
    ),
    client.query(
      `SELECT NULLIF(trim(i.topic), '') AS topic,
              COALESCE(NULLIF(trim(i.title), ''), 'Unassigned speaker') AS speaker_name,
              m.meeting_date::text AS meeting_date
         FROM meeting_program_item i
         JOIN meeting m ON m.id = i.meeting_id AND m.ward_id = $1::uuid
        WHERE i.ward_id = $1::uuid
          AND i.item_type = 'SPEAKER'
          AND NULLIF(trim(i.topic), '') IS NOT NULL
          AND ($2::date IS NULL OR m.meeting_date >= $2::date)
          AND ($3::date IS NULL OR m.meeting_date <= $3::date)
        ORDER BY m.meeting_date DESC, i.sequence ASC`,
      params
    ),
    client.query(
      `SELECT COALESCE(NULLIF(trim(i.hymn_number), ''), '—') AS hymn_number,
              COALESCE(NULLIF(trim(i.hymn_title), ''), 'Untitled hymn') AS hymn_title,
              COALESCE(NULLIF(trim(i.item_type), ''), 'HYMN') AS position,
              COUNT(*)::int AS count,
              MAX(m.meeting_date)::text AS last_used_date
         FROM meeting_program_item i
         JOIN meeting m ON m.id = i.meeting_id AND m.ward_id = $1::uuid
        WHERE i.ward_id = $1::uuid
          AND (NULLIF(trim(i.hymn_number), '') IS NOT NULL OR NULLIF(trim(i.hymn_title), '') IS NOT NULL)
          AND ($2::date IS NULL OR m.meeting_date >= $2::date)
          AND ($3::date IS NULL OR m.meeting_date <= $3::date)
        GROUP BY COALESCE(NULLIF(trim(i.hymn_number), ''), '—'),
                 COALESCE(NULLIF(trim(i.hymn_title), ''), 'Untitled hymn'),
                 COALESCE(NULLIF(trim(i.item_type), ''), 'HYMN')
        ORDER BY COUNT(*) DESC, MAX(m.meeting_date) DESC`,
      params
    ),
    client.query(
      `SELECT COALESCE(NULLIF(trim(i.title), ''), 'Unassigned') AS person_name,
              i.item_type AS prayer_type,
              COUNT(*)::int AS count,
              MAX(m.meeting_date)::text AS last_assignment_date
         FROM meeting_program_item i
         JOIN meeting m ON m.id = i.meeting_id AND m.ward_id = $1::uuid
        WHERE i.ward_id = $1::uuid
          AND i.item_type IN ('INVOCATION', 'BENEDICTION', 'OPENING_PRAYER', 'CLOSING_PRAYER')
          AND ($2::date IS NULL OR m.meeting_date >= $2::date)
          AND ($3::date IS NULL OR m.meeting_date <= $3::date)
        GROUP BY COALESCE(NULLIF(trim(i.title), ''), 'Unassigned'), i.item_type
        ORDER BY MAX(m.meeting_date) DESC, COUNT(*) DESC`,
      params
    ),
    client.query(
      `SELECT m.meeting_date::text AS meeting_date,
              i.item_type,
              COALESCE(NULLIF(trim(i.title), ''), 'Untitled item') AS title,
              CASE
                WHEN i.item_type = 'SPEAKER' AND NULLIF(trim(i.topic), '') IS NULL THEN 'Speaker topic missing'
                WHEN i.item_type = 'SPEAKER' AND NULLIF(trim(i.title), '') IS NULL THEN 'Speaker name missing'
                WHEN i.item_type IN ('HYMN', 'OPENING_HYMN', 'SACRAMENT_HYMN', 'CLOSING_HYMN')
                  AND NULLIF(trim(i.hymn_title), '') IS NULL
                  AND NULLIF(trim(i.hymn_number), '') IS NULL THEN 'Hymn details missing'
                WHEN i.item_type IN ('INVOCATION', 'BENEDICTION', 'OPENING_PRAYER', 'CLOSING_PRAYER')
                  AND NULLIF(trim(i.title), '') IS NULL THEN 'Prayer assignment missing'
                ELSE NULL
              END AS issue
         FROM meeting_program_item i
         JOIN meeting m ON m.id = i.meeting_id AND m.ward_id = $1::uuid
        WHERE i.ward_id = $1::uuid
          AND ($2::date IS NULL OR m.meeting_date >= $2::date)
          AND ($3::date IS NULL OR m.meeting_date <= $3::date)
          AND (
            (i.item_type = 'SPEAKER' AND (NULLIF(trim(i.topic), '') IS NULL OR NULLIF(trim(i.title), '') IS NULL))
            OR (i.item_type IN ('HYMN', 'OPENING_HYMN', 'SACRAMENT_HYMN', 'CLOSING_HYMN') AND NULLIF(trim(i.hymn_title), '') IS NULL AND NULLIF(trim(i.hymn_number), '') IS NULL)
            OR (i.item_type IN ('INVOCATION', 'BENEDICTION', 'OPENING_PRAYER', 'CLOSING_PRAYER') AND NULLIF(trim(i.title), '') IS NULL)
          )
        ORDER BY m.meeting_date DESC, i.sequence ASC
        LIMIT 100`,
      params
    )
  ]);

  return {
    speakers: speakerResult.rows.map((row) => ({ speakerName: text(row, 'speaker_name'), talkCount: count(row), lastTalkDate: text(row, 'last_talk_date') })),
    topics: topicResult.rows.map((row) => ({ topic: text(row, 'topic'), speakerName: text(row, 'speaker_name'), meetingDate: text(row, 'meeting_date') })),
    hymns: hymnResult.rows.map((row) => ({ hymnNumber: text(row, 'hymn_number'), hymnTitle: text(row, 'hymn_title'), position: text(row, 'position'), useCount: count(row), lastUsedDate: text(row, 'last_used_date') })),
    prayers: prayerResult.rows.map((row) => ({ personName: text(row, 'person_name'), prayerType: text(row, 'prayer_type'), assignmentCount: count(row), lastAssignmentDate: text(row, 'last_assignment_date') })),
    completeness: completenessResult.rows.filter((row) => text(row, 'issue')).map((row) => ({ meetingDate: text(row, 'meeting_date'), itemType: text(row, 'item_type'), title: text(row, 'title'), issue: text(row, 'issue') }))
  };
}
