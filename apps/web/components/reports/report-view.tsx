'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { ReportData } from '@/src/reports/aggregations';

export const REPORT_PAGES = [
  { slug: 'speakers', title: 'Speaker frequency', description: 'Recorded talks, counts, and last talk dates.' },
  { slug: 'topics', title: 'Topic history', description: 'Topics given by speakers and meeting date.' },
  { slug: 'hymns', title: 'Hymn frequency', description: 'Hymn use grouped by program position.' },
  { slug: 'prayers', title: 'Prayer frequency', description: 'Recorded prayer assignments and last dates.' },
  { slug: 'completeness', title: 'Program completeness', description: 'Missing details that need review before publishing.' }
] as const;

function reportDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

type ReportSort = 'name' | 'date' | 'count' | 'title';

function ReportSortControl({ value, onChange, options }: { value: ReportSort; onChange: (value: ReportSort) => void; options: { value: ReportSort; label: string }[] }) {
  return <label className="flex items-center gap-2 text-sm text-muted-foreground">Sort by
    <select value={value} onChange={(event) => onChange(event.target.value as ReportSort)} className="rounded-md border bg-background px-2 py-1 text-foreground">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function ReportDateFilters({ from, to }: { from: string | null; to: string | null }) {
  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
      <label className="text-sm">
        From
        <input name="from" type="date" defaultValue={from ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" />
      </label>
      <label className="text-sm">
        To
        <input name="to" type="date" defaultValue={to ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" />
      </label>
      <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground sm:self-end">
        Apply filters
      </button>
    </form>
  );
}

export function ReportView({ slug, data }: { slug: string; data: ReportData }) {
  const [sortBy, setSortBy] = useState<ReportSort>('name');
  const speakers = useMemo(() => [...data.speakers].sort((left, right) => sortBy === 'count' ? right.talkCount - left.talkCount : sortBy === 'date' ? right.lastTalkDate.localeCompare(left.lastTalkDate) : left.speakerName.localeCompare(right.speakerName)), [data.speakers, sortBy]);
  const topics = useMemo(() => [...data.topics].sort((left, right) => sortBy === 'date' ? right.meetingDate.localeCompare(left.meetingDate) : sortBy === 'title' ? left.topic.localeCompare(right.topic) : left.speakerName.localeCompare(right.speakerName)), [data.topics, sortBy]);
  const hymns = useMemo(() => [...data.hymns].sort((left, right) => sortBy === 'count' ? right.useCount - left.useCount : sortBy === 'date' ? right.lastUsedDate.localeCompare(left.lastUsedDate) : left.hymnTitle.localeCompare(right.hymnTitle)), [data.hymns, sortBy]);
  const prayers = useMemo(() => [...data.prayers].sort((left, right) => sortBy === 'count' ? right.assignmentCount - left.assignmentCount : sortBy === 'date' ? right.lastAssignmentDate.localeCompare(left.lastAssignmentDate) : left.personName.localeCompare(right.personName)), [data.prayers, sortBy]);
  const completeness = useMemo(() => [...data.completeness].sort((left, right) => sortBy === 'date' ? right.meetingDate.localeCompare(left.meetingDate) : sortBy === 'title' ? left.title.localeCompare(right.title) : left.issue.localeCompare(right.issue)), [data.completeness, sortBy]);
  if (slug === 'speakers') {
    return (
      <ReportSection title="Speaker frequency" count={`${data.speakers.length} speakers`} empty="No recorded talks match filters." controls={<ReportSortControl value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: 'Speaker' }, { value: 'count', label: 'Talk count' }, { value: 'date', label: 'Last talk' }]} />}>
        {speakers.map((speaker) => (
          <li key={speaker.speakerName} className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
            <span className="font-medium">{speaker.speakerName}</span>
            <span className="text-right text-xs text-muted-foreground">
              {speaker.talkCount} {speaker.talkCount === 1 ? 'talk' : 'talks'} · last {reportDate(speaker.lastTalkDate)}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'topics') {
    return (
      <ReportSection title="Topic history" count={`${data.topics.length} topics`} empty="No recorded speaker topics match filters." controls={<ReportSortControl value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: 'Speaker' }, { value: 'title', label: 'Topic' }, { value: 'date', label: 'Meeting date' }]} />}>
        {topics.map((topic, index) => (
          <li key={`${topic.meetingDate}-${topic.speakerName}-${index}`} className="rounded-md border bg-background/60 px-3 py-2">
            <p className="font-medium">{topic.topic}</p>
            <p className="text-xs text-muted-foreground">
              {topic.speakerName} · {reportDate(topic.meetingDate)}
            </p>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'hymns') {
    return (
      <ReportSection title="Hymn frequency" count={`${data.hymns.length} hymns`} empty="No recorded hymns match filters." controls={<ReportSortControl value={sortBy} onChange={setSortBy} options={[{ value: 'title', label: 'Hymn' }, { value: 'count', label: 'Use count' }, { value: 'date', label: 'Last used' }]} />}>
        {hymns.map((hymn) => (
          <li
            key={`${hymn.hymnNumber}-${hymn.position}`}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2"
          >
            <span>
              <span className="font-medium">
                {hymn.hymnNumber} · {hymn.hymnTitle}
              </span>
              <span className="block text-xs text-muted-foreground">{hymn.position.replaceAll('_', ' ')}</span>
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {hymn.useCount} uses · last {reportDate(hymn.lastUsedDate)}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'prayers') {
    return (
      <ReportSection title="Prayer frequency" count={`${data.prayers.length} assignments`} empty="No recorded prayers match filters." controls={<ReportSortControl value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: 'Person' }, { value: 'count', label: 'Assignment count' }, { value: 'date', label: 'Last assigned' }]} />}>
        {prayers.map((prayer) => (
          <li
            key={`${prayer.personName}-${prayer.prayerType}`}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2"
          >
            <span>
              <span className="font-medium">{prayer.personName}</span>
              <span className="block text-xs text-muted-foreground">{prayer.prayerType.replaceAll('_', ' ')}</span>
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {prayer.assignmentCount} assignments · last {reportDate(prayer.lastAssignmentDate)}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  return (
    <ReportSection
      title="Program completeness"
      count={`${data.completeness.length} warnings`}
      empty="No completeness warnings match filters."
      controls={<ReportSortControl value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: 'Issue' }, { value: 'title', label: 'Item' }, { value: 'date', label: 'Meeting date' }]} />}
    >
      {completeness.map((warning, index) => (
        <li
          key={`${warning.meetingDate}-${warning.itemType}-${index}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2"
        >
          <span>
            <span className="font-medium">{warning.issue}</span>
            <span className="block text-xs text-muted-foreground">
              {warning.title} · {warning.itemType.replaceAll('_', ' ')}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{reportDate(warning.meetingDate)}</span>
        </li>
      ))}
    </ReportSection>
  );
}

function ReportSection({ title, count, empty, controls, children }: { title: string; count: string; empty: string; controls?: ReactNode; children: ReactNode }) {
  return (
    <section className="section-panel section-panel--service p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2"><h2 className="font-semibold">{title}</h2><span className="text-xs text-muted-foreground">{count}</span></div>
        {controls}
      </div>
      {children ? <ul className="mt-3 space-y-2 text-sm">{children}</ul> : <p className="mt-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

export function ReportHub() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {REPORT_PAGES.map((report) => (
        <Link
          key={report.slug}
          href={`/reports/${report.slug}`}
          className="section-panel section-panel--service rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
        >
          <h2 className="font-semibold">{report.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
          <span className="mt-4 inline-block text-sm font-medium text-primary">Open report</span>
        </Link>
      ))}
      <Link
        href="/reports/notes"
        className="section-panel section-panel--service rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <h2 className="font-semibold">Notes report</h2>
        <p className="mt-2 text-sm text-muted-foreground">Review ward notes visible to your account.</p>
        <span className="mt-4 inline-block text-sm font-medium text-primary">Open report</span>
      </Link>
    </section>
  );
}
