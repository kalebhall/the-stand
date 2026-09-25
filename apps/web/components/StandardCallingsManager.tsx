'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

type UnitType = 'ward' | 'stake' | 'branch' | 'district';

export type StandardCalling = {
  id: string;
  name: string;
  organization: string | null;
  unitType: UnitType;
  sortOrder: number;
  isActive: boolean;
};

type Props = {
  callings: StandardCalling[];
  canManage: boolean;
};

const ALL_UNIT_TYPES: UnitType[] = ['ward', 'stake', 'branch', 'district'];

type FormState = {
  name: string;
  organization: string;
  unitType: UnitType;
  sortOrder: number;
};

function errorMessage(code: string | undefined, t: (key: string) => string): string {
  switch (code) {
    case 'DUPLICATE':
      return t('standardCallingDuplicate');
    case 'VALIDATION_ERROR':
      return t('standardCallingInvalid');
    case 'FORBIDDEN':
      return t('forbidden');
    case 'UNAUTHORIZED':
      return t('unauthorized');
    case 'NOT_FOUND':
      return t('standardCallingNotFound');
    default:
      return t('saveError');
  }
}

const EMPTY_FORM: FormState = {
  name: '',
  organization: '',
  unitType: 'ward',
  sortOrder: 0
};

type DialogMode = { kind: 'add' } | { kind: 'edit'; calling: StandardCalling } | null;

export function StandardCallingsManager({ callings, canManage }: Props) {
  const t = useTranslations('callings');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<UnitType>('ward');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = callings.filter((c) => c.unitType === activeTab);

  function openAdd() {
    setForm({ ...EMPTY_FORM, unitType: activeTab });
    setError(null);
    setDialog({ kind: 'add' });
  }

  function openEdit(calling: StandardCalling) {
    setForm({
      name: calling.name,
      organization: calling.organization ?? '',
      unitType: calling.unitType,
      sortOrder: calling.sortOrder
    });
    setError(null);
    setDialog({ kind: 'edit', calling });
  }

  function closeDialog() {
    setDialog(null);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError(t('callingNameRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name.trim(),
        organization: form.organization.trim() || null,
        unitType: form.unitType,
        sortOrder: form.sortOrder
      };

      let res: Response;

      if (dialog?.kind === 'edit') {
        res = await fetch(`/api/standard-callings/${dialog.calling.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, isActive: dialog.calling.isActive })
        });
      } else {
        res = await fetch('/api/standard-callings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(errorMessage(data.code, t));
        return;
      }

      closeDialog();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/standard-callings/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(errorMessage(data.code, t));
        return;
      }
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {ALL_UNIT_TYPES.map((type) => {
          const count = callings.filter((c) => c.unitType === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === type ? 'border-b-2 border-foreground text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(type)}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{count}</span>
            </button>
          );
        })}

        {canManage ? (
          <div className="ml-auto">
            <Button size="sm" onClick={openAdd}>
              {t('addCalling')}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('callingName')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('organization')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('sortOrder')}</th>
                {canManage ? <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('actions')}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((calling) => (
                <tr key={calling.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{calling.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{calling.organization ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{calling.sortOrder}</td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(calling)}>
                          {t('edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          disabled={deleting === calling.id}
                          onClick={() => {
                            if (confirm(t('deleteConfirm', { name: calling.name }))) {
                              void handleDelete(calling.id);
                            }
                          }}
                        >
                          {deleting === calling.id ? t('deleting') : t('delete')}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('noUnitCallings', { unit: t(activeTab).toLowerCase() })}
        </p>
      )}

      {/* Add / Edit dialog */}
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{dialog.kind === 'add' ? t('addStandardCalling') : t('editStandardCalling')}</h2>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sc-name">
                  {t('callingName')} <span className="text-destructive">*</span>
                </label>
                <input
                  id="sc-name"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('callingNamePlaceholder')}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sc-org">
                  {t('organization')}
                </label>
                <input
                  id="sc-org"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                  placeholder={t('organizationPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sc-unit">
                    {t('unitType')} <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="sc-unit"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.unitType}
                    onChange={(e) => setForm((f) => ({ ...f, unitType: e.target.value as UnitType }))}
                  >
                    {ALL_UNIT_TYPES.map((unitType) => (
                      <option key={unitType} value={unitType}>
                        {t(unitType)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="sc-sort">
                    {t('sortOrder')}
                  </label>
                  <input
                    id="sc-sort"
                    type="number"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? t('saving') : dialog.kind === 'add' ? t('addCalling') : t('saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
