'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { createStake, updateStake, deleteStake, createWard, updateWard, deleteWard } from './actions';

export type StakeRow = {
  id: string;
  name: string;
  created_at: string;
};

export type WardRow = {
  id: string;
  stake_id: string;
  name: string;
  unit_number: string | null;
  stake_name: string;
  created_at: string;
};

type Props = {
  stakes: StakeRow[];
  wards: WardRow[];
};

type Tab = 'stakes' | 'wards';

export default function StakeWardManager({ stakes, wards }: Props) {
  const t = useTranslations('supportProvisioning');
  const locale = useLocale();
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale).format(new Date(value));
  const [tab, setTab] = useState<Tab>('stakes');
  const [stakeSearch, setStakeSearch] = useState('');
  const [wardSearch, setWardSearch] = useState('');
  const [wardFilterStake, setWardFilterStake] = useState('');
  const [showCreateStake, setShowCreateStake] = useState(false);
  const [showCreateWard, setShowCreateWard] = useState(false);
  const [editingStakeId, setEditingStakeId] = useState<string | null>(null);
  const [editingWardId, setEditingWardId] = useState<string | null>(null);
  const [confirmDeleteStakeId, setConfirmDeleteStakeId] = useState<string | null>(null);
  const [confirmDeleteWardId, setConfirmDeleteWardId] = useState<string | null>(null);

  const wardCountByStake = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of wards) {
      map.set(w.stake_id, (map.get(w.stake_id) ?? 0) + 1);
    }
    return map;
  }, [wards]);

  const filteredStakes = useMemo(() => {
    const q = stakeSearch.toLowerCase();
    if (!q) return stakes;
    return stakes.filter((s) => s.name.toLowerCase().includes(q));
  }, [stakes, stakeSearch]);

  const filteredWards = useMemo(() => {
    const q = wardSearch.toLowerCase();
    return wards.filter((w) => {
      if (wardFilterStake && w.stake_id !== wardFilterStake) return false;
      if (q) {
        const matchName = w.name.toLowerCase().includes(q);
        const matchUnit = w.unit_number?.toLowerCase().includes(q);
        const matchStake = w.stake_name.toLowerCase().includes(q);
        if (!matchName && !matchUnit && !matchStake) return false;
      }
      return true;
    });
  }, [wards, wardSearch, wardFilterStake]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-card p-1">
        <button
          onClick={() => setTab('stakes')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === 'stakes' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('stakesTab', { count: stakes.length })}
        </button>
        <button
          onClick={() => setTab('wards')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === 'wards' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('wardsTab', { count: wards.length })}
        </button>
      </div>

      {/* Stakes Tab */}
      {tab === 'stakes' && (
        <div className="space-y-4">
          {/* Filters + Create */}
          <section className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="text-xs text-muted-foreground">
                {t('searchStakes')}
                <input
                  type="text"
                  value={stakeSearch}
                  onChange={(e) => setStakeSearch(e.target.value)}
                  placeholder={t('stakeSearchPlaceholder')}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={() => setShowCreateStake(!showCreateStake)}>
                  {showCreateStake ? t('cancel') : t('addStake')}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('showingStakes', { shown: filteredStakes.length, total: stakes.length })}
            </p>
          </section>

          {/* Create Stake Form */}
          {showCreateStake && (
            <section className="rounded-lg border bg-card p-4 text-card-foreground">
              <h2 className="text-lg font-semibold">{t('createStake')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('createStakeDescription')}</p>
              <form
                action={async (formData) => {
                  await createStake(formData);
                  setShowCreateStake(false);
                }}
                className="mt-3 flex items-end gap-3"
              >
                <label className="flex-1 text-xs text-muted-foreground">
                  {t('stakeName')}
                  <input
                    name="name"
                    required
                    placeholder={t('enterStakeName')}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <Button type="submit" size="sm">
                  {t('createStake')}
                </Button>
              </form>
            </section>
          )}

          {/* Stake List */}
          <section className="space-y-2">
            {filteredStakes.length === 0 && <p className="text-sm text-muted-foreground">{t('noStakes')}</p>}
            {filteredStakes.map((stake) => {
              const isEditing = editingStakeId === stake.id;
              const wardCount = wardCountByStake.get(stake.id) ?? 0;

              return (
                <article key={stake.id} className="rounded-lg border bg-card text-card-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-0.5">
                      <p className="font-medium">{stake.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('wardCount', { count: wardCount })} &middot; {t('created')}: {formatDate(stake.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingStakeId(isEditing ? null : stake.id)}>
                        {isEditing ? t('close') : t('edit')}
                      </Button>
                      {confirmDeleteStakeId === stake.id ? (
                        <div className="flex items-center gap-1">
                          <form action={deleteStake}>
                            <input type="hidden" name="stakeId" value={stake.id} />
                            <Button variant="destructive" size="sm" type="submit">
                              {t('confirm')}
                            </Button>
                          </form>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteStakeId(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDeleteStakeId(stake.id)}
                          disabled={wardCount > 0}
                          title={wardCount > 0 ? t('removeWardsFirst') : undefined}
                        >
{t('delete')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="border-t px-4 py-3">
                      <form
                        action={async (formData) => {
                          await updateStake(formData);
                          setEditingStakeId(null);
                        }}
                        className="flex items-end gap-3"
                      >
                        <input type="hidden" name="stakeId" value={stake.id} />
                        <label className="flex-1 text-xs text-muted-foreground">
                          {t('stakeName')}
                          <input
                            name="name"
                            required
                            defaultValue={stake.name}
                            className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                          />
                        </label>
                        <Button type="submit" size="sm">
{t('save')}
                        </Button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      )}

      {/* Wards Tab */}
      {tab === 'wards' && (
        <div className="space-y-4">
          {/* Filters + Create */}
          <section className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs text-muted-foreground">
                {t('searchWards')}
                <input
                  type="text"
                  value={wardSearch}
                  onChange={(e) => setWardSearch(e.target.value)}
                  placeholder={t('wardSearchPlaceholder')}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t('filterByStake')}
                <select
                  value={wardFilterStake}
                  onChange={(e) => setWardFilterStake(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                >
                  <option value="">{t('allStakes')}</option>
                  {stakes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={() => setShowCreateWard(!showCreateWard)}>
                  {showCreateWard ? t('cancel') : t('addWard')}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('showingWards', { shown: filteredWards.length, total: wards.length })}
            </p>
          </section>

          {/* Create Ward Form */}
          {showCreateWard && (
            <section className="rounded-lg border bg-card p-4 text-card-foreground">
              <h2 className="text-lg font-semibold">{t('createWard')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('createWardDescription')}</p>
              <form
                action={async (formData) => {
                  await createWard(formData);
                  setShowCreateWard(false);
                }}
                className="mt-3 space-y-3"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    {t('stake')}
                    <select name="stakeId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground">
                      <option value="">{t('selectStake')}</option>
                      {stakes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    {t('wardName')}
                    <input
                      name="wardName"
                      required
                      placeholder={t('enterWardName')}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    {t('unitNumberOptional')}
                    <input
                      name="unitNumber"
                      placeholder={t('unitNumberPlaceholder')}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                </div>
                <Button type="submit" size="sm">
                  {t('createWard')}
                </Button>
              </form>
            </section>
          )}

          {/* Ward List */}
          <section className="space-y-2">
            {filteredWards.length === 0 && <p className="text-sm text-muted-foreground">{t('noWards')}</p>}
            {filteredWards.map((ward) => {
              const isEditing = editingWardId === ward.id;

              return (
                <article key={ward.id} className="rounded-lg border bg-card text-card-foreground">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-0.5">
                      <p className="font-medium">{ward.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ward.stake_name}
                        {ward.unit_number ? ` · ${t('unit')} ${ward.unit_number}` : ''}
                        {` · ${t('created')}: `}
                        {formatDate(ward.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingWardId(isEditing ? null : ward.id)}>
                        {isEditing ? t('close') : t('edit')}
                      </Button>
                      {confirmDeleteWardId === ward.id ? (
                        <div className="flex items-center gap-1">
                          <form action={deleteWard}>
                            <input type="hidden" name="wardId" value={ward.id} />
                            <Button variant="destructive" size="sm" type="submit">
                              {t('confirm')}
                            </Button>
                          </form>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteWardId(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWardId(ward.id)}>
{t('delete')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="border-t px-4 py-3">
                      <form
                        action={async (formData) => {
                          await updateWard(formData);
                          setEditingWardId(null);
                        }}
                        className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
                      >
                        <input type="hidden" name="wardId" value={ward.id} />
                        <label className="text-xs text-muted-foreground">
                          {t('stake')}
                          <select
                            name="stakeId"
                            required
                            defaultValue={ward.stake_id}
                            className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                          >
                            {stakes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-muted-foreground">
                          {t('wardName')}
                          <input
                            name="name"
                            required
                            defaultValue={ward.name}
                            className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          {t('unitNumber')}
                          <input
                            name="unitNumber"
                            defaultValue={ward.unit_number ?? ''}
                            placeholder={t('optional')}
                            className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
                          />
                        </label>
                        <Button type="submit" size="sm">
{t('save')}
                        </Button>
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
