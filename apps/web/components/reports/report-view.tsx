'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { ReportData } from '@/src/reports/aggregations';
import { REPORT_PAGES } from '@/src/reports/pages';

function reportDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

type ReportSort = 'name' | 'date' | 'count' | 'title';

const issueKeys: Record<string, string> = {
  'Speaker topic missing': 'issues.speakerTopicMissing',
  'Speaker name missing': 'issues.speakerNameMissing',
  'Hymn details missing': 'issues.hymnDetailsMissing',
  'Prayer assignment missing': 'issues.prayerAssignmentMissing'
};

function ReportSortControl({ value, onChange, options, label }: { value: ReportSort; onChange: (value: ReportSort) => void; options: { value: ReportSort; label: string }[]; label: string }) {
  return <label className="flex items-center gap-2 text-sm text-muted-foreground">{label}
    <select value={value} onChange={(event) => onChange(event.target.value as ReportSort)} className="rounded-md border bg-background px-2 py-1 text-foreground">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function ReportDateFilters({ from, to }: { from: string | null; to: string | null }) {
  const t = useTranslations('reports');
  return (
    <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
      <label className="text-sm">
        {t('dateFrom')}
        <input name="from" type="date" defaultValue={from ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" />
      </label>
      <label className="text-sm">
        {t('dateTo')}
        <input name="to" type="date" defaultValue={to ?? ''} className="mt-1 w-full rounded-md border bg-background p-2" />
      </label>
      <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground sm:self-end">
        {t('applyFilters')}
      </button>
    </form>
  );
}

export function ReportView({ slug, data }: { slug: string; data: ReportData }) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const [sortBy, setSortBy] = useState<ReportSort>('name');
  const speakers = useMemo(() => [...data.speakers].sort((left, right) => sortBy === 'count' ? right.talkCount - left.talkCount : sortBy === 'date' ? right.lastTalkDate.localeCompare(left.lastTalkDate) : left.speakerName.localeCompare(right.speakerName)), [data.speakers, sortBy]);
  const topics = useMemo(() => [...data.topics].sort((left, right) => sortBy === 'date' ? right.meetingDate.localeCompare(left.meetingDate) : sortBy === 'title' ? left.topic.localeCompare(right.topic) : left.speakerName.localeCompare(right.speakerName)), [data.topics, sortBy]);
  const hymns = useMemo(() => [...data.hymns].sort((left, right) => sortBy === 'count' ? right.useCount - left.useCount : sortBy === 'date' ? right.lastUsedDate.localeCompare(left.lastUsedDate) : left.hymnTitle.localeCompare(right.hymnTitle)), [data.hymns, sortBy]);
  const prayers = useMemo(() => [...data.prayers].sort((left, right) => sortBy === 'count' ? right.assignmentCount - left.assignmentCount : sortBy === 'date' ? right.lastAssignmentDate.localeCompare(left.lastAssignmentDate) : left.personName.localeCompare(right.personName)), [data.prayers, sortBy]);
  const completeness = useMemo(() => [...data.completeness].sort((left, right) => sortBy === 'date' ? right.meetingDate.localeCompare(left.meetingDate) : sortBy === 'title' ? left.title.localeCompare(right.title) : left.issue.localeCompare(right.issue)), [data.completeness, sortBy]);
  const issueLabel = (issue: string) => issueKeys[issue] ? t(issueKeys[issue]) : issue;
  const positionLabel = (position: string) => t(`positions.${position}`);
  if (slug === 'speakers') {
    return (
      <ReportSection title={t('speakerFrequency')} count={t('counts.speakers', { count: data.speakers.length })} empty={t('noTalks')} controls={<ReportSortControl label={t('sortBy')} value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: t('speaker') }, { value: 'count', label: t('talkCount') }, { value: 'date', label: t('lastTalk') }]} />}>
        {speakers.map((speaker) => (
          <li key={speaker.speakerName} className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2">
            <span className="font-medium">{speaker.speakerName}</span>
            <span className="text-right text-xs text-muted-foreground">
              {t('counts.talks', { count: speaker.talkCount })} · {t('last', { date: reportDate(speaker.lastTalkDate, locale) })}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'topics') {
    return (
      <ReportSection title={t('topicHistory')} count={t('counts.topics', { count: data.topics.length })} empty={t('noTopics')} controls={<ReportSortControl label={t('sortBy')} value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: t('speaker') }, { value: 'title', label: t('topic') }, { value: 'date', label: t('meetingDate') }]} />}>
        {topics.map((topic, index) => (
          <li key={`${topic.meetingDate}-${topic.speakerName}-${index}`} className="rounded-md border bg-background/60 px-3 py-2">
            <p className="font-medium">{topic.topic}</p>
            <p className="text-xs text-muted-foreground">
              {topic.speakerName} · {reportDate(topic.meetingDate, locale)}
            </p>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'hymns') {
    return (
      <ReportSection title={t('hymnFrequency')} count={t('counts.hymns', { count: data.hymns.length })} empty={t('noHymns')} controls={<ReportSortControl label={t('sortBy')} value={sortBy} onChange={setSortBy} options={[{ value: 'title', label: t('hymn') }, { value: 'count', label: t('useCount') }, { value: 'date', label: t('lastUsed') }]} />}>
        {hymns.map((hymn) => (
          <li
            key={`${hymn.hymnNumber}-${hymn.position}`}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2"
          >
            <span>
              <span className="font-medium">
                {hymn.hymnNumber} · {hymn.hymnTitle}
              </span>
              <span className="block text-xs text-muted-foreground">{positionLabel(hymn.position)}</span>
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {t('counts.uses', { count: hymn.useCount })} · {t('last', { date: reportDate(hymn.lastUsedDate, locale) })}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  if (slug === 'prayers') {
    return (
      <ReportSection title={t('prayerFrequency')} count={t('counts.people', { count: data.prayers.length })} empty={t('noPrayers')} controls={<ReportSortControl label={t('sortBy')} value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: t('person') }, { value: 'count', label: t('assignmentCount') }, { value: 'date', label: t('lastAssigned') }]} />}>
        {prayers.map((prayer) => (
          <li
            key={prayer.personName}
            className="flex items-center justify-between gap-3 rounded-md border bg-background/60 px-3 py-2"
          >
            <span>
              <span className="font-medium">{prayer.personName}</span>

            </span>
            <span className="text-right text-xs text-muted-foreground">
              {t('counts.assignments', { count: prayer.assignmentCount })} · {t('last', { date: reportDate(prayer.lastAssignmentDate, locale) })}
            </span>
          </li>
        ))}
      </ReportSection>
    );
  }
  return (
    <ReportSection
      title={t('programCompleteness')}
      count={t('counts.warnings', { count: data.completeness.length })}
      empty={t('noWarnings')}
      controls={<ReportSortControl label={t('sortBy')} value={sortBy} onChange={setSortBy} options={[{ value: 'name', label: t('issue') }, { value: 'title', label: t('item') }, { value: 'date', label: t('meetingDate') }]} />}
    >
      {completeness.map((warning, index) => (
        <li
          key={`${warning.meetingDate}-${warning.itemType}-${index}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2"
        >
          <span>
            <span className="font-medium">{issueLabel(warning.issue)}</span>
            <span className="block text-xs text-muted-foreground">
              {warning.title} · {positionLabel(warning.itemType)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">{reportDate(warning.meetingDate, locale)}</span>
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
  const t = useTranslations('reports');
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {REPORT_PAGES.map((report) => (
        <Link
          key={report.slug}
          href={`/reports/${report.slug}`}
          className="section-panel section-panel--service rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
        >
          <h2 className="font-semibold">{t(report.titleKey)}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t(report.descriptionKey)}</p>
          <span className="mt-4 inline-block text-sm font-medium text-primary">{t('openReport')}</span>
        </Link>
      ))}
      <Link
        href="/reports/notes"
        className="section-panel section-panel--service rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <h2 className="font-semibold">{t('notesReport')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('notesDescription')}</p>
        <span className="mt-4 inline-block text-sm font-medium text-primary">{t('openReport')}</span>
      </Link>
    </section>
  );
}
