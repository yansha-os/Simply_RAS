'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Check,
  FileWarning,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createStaffCredential,
  deleteStaffCredential,
  listActiveStaffCredentials,
  revokeStaffCredential,
  updateStaffCredential,
} from '@/app/actions/staffCredentialActions';

type CredentialRow = {
  id: string;
  userId: string;
  credentialType: string;
  credentialNumber: string | null;
  payerName: string | null;
  isCredentialed: boolean;
  expirationDate: string | null;
  updatedAt: string;
};

export type StaffCredentialUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  credentials: CredentialRow[];
};

type StaffCredentialManagerProps = {
  initialStaff: StaffCredentialUser[];
  initialAsOfDate: string;
  initialError?: string | null;
};

type CredentialState = 'ON_FILE' | 'EXPIRED' | 'REVOKED';

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-brand-orange-500/60 focus:ring-2 focus:ring-brand-orange-500/10';

function credentialState(credential: CredentialRow, asOfDate: string): CredentialState {
  if (!credential.isCredentialed) return 'REVOKED';
  if (credential.expirationDate && credential.expirationDate < asOfDate) return 'EXPIRED';
  return 'ON_FILE';
}

function formatDateOnly(value: string | null) {
  if (!value) return 'No expiry stored';
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function StateBadge({ state }: { state: CredentialState }) {
  if (state === 'EXPIRED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Expired
      </span>
    );
  }
  if (state === 'REVOKED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
        <Ban className="h-3 w-3" />
        Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
      <Check className="h-3 w-3" />
      On file
    </span>
  );
}

export default function StaffCredentialManager({
  initialStaff,
  initialAsOfDate,
  initialError = null,
}: StaffCredentialManagerProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [asOfDate, setAsOfDate] = useState(initialAsOfDate);
  const [loadError, setLoadError] = useState(initialError);
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newCredential, setNewCredential] = useState({
    userId: initialStaff[0]?.id ?? '',
    credentialType: '',
    expirationDate: '',
  });
  const [editing, setEditing] = useState<{
    id: string;
    credentialType: string;
    expirationDate: string;
  } | null>(null);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((person) =>
      [
        person.name,
        person.email,
        person.role,
        ...person.credentials.flatMap((credential) => [
          credential.credentialType,
          credential.credentialNumber ?? '',
          credential.payerName ?? '',
        ]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [search, staff]);

  const credentialCount = staff.reduce((total, person) => total + person.credentials.length, 0);
  const expiredCount = staff.reduce(
    (total, person) =>
      total +
      person.credentials.filter(
        (credential) => credentialState(credential, asOfDate) === 'EXPIRED',
      ).length,
    0,
  );
  const missingCount = staff.filter((person) => person.credentials.length === 0).length;

  async function refreshStaff({ notify = true }: { notify?: boolean } = {}) {
    const result = await listActiveStaffCredentials();
    if (!result.success) {
      setLoadError(result.error);
      if (notify) toast.error(result.error);
      return false;
    }

    setStaff(result.data);
    setAsOfDate(result.asOfDate);
    setLoadError(null);
    setNewCredential((current) => ({
      ...current,
      userId: result.data.some((person) => person.id === current.userId)
        ? current.userId
        : (result.data[0]?.id ?? ''),
    }));
    if (notify) toast.success('Credential roster refreshed.');
    return true;
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCredential.userId) {
      toast.error('Select an active staff member.');
      return;
    }

    setBusyKey('create');
    const result = await createStaffCredential({
      userId: newCredential.userId,
      credentialType: newCredential.credentialType,
      expirationDate: newCredential.expirationDate || null,
    });
    if (!result.success) {
      toast.error(result.error);
      setBusyKey(null);
      return;
    }

    toast.success('Credential record added.');
    setNewCredential((current) => ({
      ...current,
      credentialType: '',
      expirationDate: '',
    }));
    await refreshStaff({ notify: false });
    setBusyKey(null);
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setBusyKey(`update:${editing.id}`);
    const result = await updateStaffCredential({
      id: editing.id,
      credentialType: editing.credentialType,
      expirationDate: editing.expirationDate || null,
    });
    if (!result.success) {
      toast.error(result.error);
      setBusyKey(null);
      return;
    }

    toast.success('Credential record updated.');
    setEditing(null);
    await refreshStaff({ notify: false });
    setBusyKey(null);
  }

  async function handleRevoke(credential: CredentialRow) {
    const confirmed = window.confirm(
      `Revoke the stored ${credential.credentialType} record? It will remain in the audit history and can no longer appear as on file.`,
    );
    if (!confirmed) return;

    setBusyKey(`revoke:${credential.id}`);
    const result = await revokeStaffCredential(credential.id);
    if (!result.success) {
      toast.error(result.error);
      setBusyKey(null);
      return;
    }

    toast.success('Credential record revoked.');
    await refreshStaff({ notify: false });
    setBusyKey(null);
  }

  async function handleDelete(credential: CredentialRow) {
    const confirmed = window.confirm(
      `Permanently delete the stored ${credential.credentialType} record? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyKey(`delete:${credential.id}`);
    const result = await deleteStaffCredential(credential.id);
    if (!result.success) {
      toast.error(result.error);
      setBusyKey(null);
      return;
    }

    toast.success('Credential record deleted.');
    if (editing?.id === credential.id) setEditing(null);
    await refreshStaff({ notify: false });
    setBusyKey(null);
  }

  return (
    <div className="relative space-y-6 pb-12 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-8 h-72 w-72 rounded-full bg-brand-orange-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-96 -left-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl"
      />

      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.13),transparent_58%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-orange-400">
              <ShieldCheck className="h-4 w-4" />
              Restricted credential administration
            </div>
            <h1 className="font-heading text-3xl font-black tracking-tight text-white sm:text-4xl">
              Staff Credential Workspace
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
              Maintain credential types and expiration dates for active staff. Status labels reflect
              stored records only; they do not independently verify or certify a staff member.
            </p>
          </div>
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => {
              setBusyKey('refresh');
              void refreshStaff().finally(() => setBusyKey(null));
            }}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-brand-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busyKey === 'refresh' ? 'animate-spin' : ''}`} />
            Refresh roster
          </button>
        </div>
      </header>

      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">The latest roster could not be loaded.</p>
            <p className="mt-0.5 text-xs text-rose-300/80">{loadError}</p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Active staff',
            value: staff.length,
            detail: 'Accounts currently enabled',
            icon: Users,
            color: 'text-sky-300',
            border: 'hover:border-sky-500/40',
          },
          {
            label: 'Stored records',
            value: credentialCount,
            detail: 'All credential rows',
            icon: ShieldCheck,
            color: 'text-emerald-300',
            border: 'hover:border-emerald-500/40',
          },
          {
            label: 'Expired',
            value: expiredCount,
            detail: `As of ${formatDateOnly(asOfDate)}`,
            icon: CalendarDays,
            color: 'text-amber-300',
            border: 'hover:border-amber-500/40',
          },
          {
            label: 'Missing',
            value: missingCount,
            detail: 'Staff with no stored rows',
            icon: FileWarning,
            color: 'text-rose-300',
            border: 'hover:border-rose-500/40',
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={`rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl ${metric.border}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  {metric.label}
                </p>
                <Icon className={`h-4 w-4 ${metric.color}`} />
              </div>
              <p className="mt-2 font-heading text-3xl font-black text-white">{metric.value}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{metric.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-brand-orange-500/5 blur-3xl" />
        <div className="relative mb-5">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-orange-400" />
            <h2 className="font-heading text-lg font-black text-white">Add credential record</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            An expiration date is optional. New rows are stored as on file until revoked or expired.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="relative grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]"
        >
          <label className="space-y-1.5 text-xs font-bold text-zinc-400">
            Active staff member
            <select
              required
              value={newCredential.userId}
              onChange={(event) =>
                setNewCredential((current) => ({ ...current, userId: event.target.value }))
              }
              className={`${INPUT_CLASS} cursor-pointer`}
              disabled={staff.length === 0 || busyKey !== null}
            >
              {staff.length === 0 && <option value="">No active staff found</option>}
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.role}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-zinc-400">
            Credential type
            <input
              required
              maxLength={80}
              value={newCredential.credentialType}
              onChange={(event) =>
                setNewCredential((current) => ({
                  ...current,
                  credentialType: event.target.value,
                }))
              }
              placeholder="e.g. CPR_CERT"
              className={INPUT_CLASS}
              disabled={busyKey !== null}
            />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-zinc-400">
            Expiration date
            <input
              type="date"
              value={newCredential.expirationDate}
              onChange={(event) =>
                setNewCredential((current) => ({
                  ...current,
                  expirationDate: event.target.value,
                }))
              }
              className={`${INPUT_CLASS} cursor-pointer [color-scheme:dark]`}
              disabled={busyKey !== null}
            />
          </label>
          <button
            type="submit"
            disabled={staff.length === 0 || busyKey !== null}
            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-orange-500 px-5 text-xs font-black text-white shadow-lg shadow-brand-orange-500/15 transition-all duration-300 hover:scale-[1.01] hover:bg-brand-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyKey === 'create' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add record
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-black text-white">Active staff roster</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {filteredStaff.length} of {staff.length} active staff shown
            </p>
          </div>
          <label className="relative block sm:w-80">
            <span className="sr-only">Search staff credentials</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search staff, role, type, payer…"
              className={`${INPUT_CLASS} pl-9`}
            />
          </label>
        </div>

        {filteredStaff.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 bg-zinc-950/60 px-6 py-14 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.06),transparent_60%)]" />
            <FileWarning className="relative mx-auto h-9 w-9 text-zinc-600" />
            <p className="relative mt-3 font-heading font-bold text-white">
              {staff.length === 0 ? 'No active staff accounts found' : 'No matching staff found'}
            </p>
            <p className="relative mt-1 text-xs text-zinc-500">
              {staff.length === 0
                ? 'Credential rows can be added after an active staff account exists.'
                : 'Try a different name, role, credential type, or payer.'}
            </p>
          </div>
        ) : (
          filteredStaff.map((person) => (
            <article
              key={person.id}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/75 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/30 hover:shadow-2xl"
            >
              <div className="flex flex-col gap-4 border-b border-white/5 bg-white/[0.02] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-orange-500/20 bg-brand-orange-500/10 font-mono text-xs font-black text-brand-orange-300">
                    {initials(person.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-heading font-black text-white">{person.name}</h3>
                      <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-sky-300">
                        {person.role.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="truncate font-mono text-[11px] text-zinc-500">{person.email}</p>
                  </div>
                </div>
                {person.credentials.length === 0 ? (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
                    <FileWarning className="h-3 w-3" />
                    Missing · no records
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    {person.credentials.length} stored{' '}
                    {person.credentials.length === 1 ? 'record' : 'records'}
                  </span>
                )}
              </div>

              {person.credentials.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-zinc-500">
                  No credential records are stored for this staff member.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {person.credentials.map((credential) => {
                    const state = credentialState(credential, asOfDate);
                    const isUpdating = busyKey === `update:${credential.id}`;
                    const isRevoking = busyKey === `revoke:${credential.id}`;
                    const isDeleting = busyKey === `delete:${credential.id}`;

                    if (editing?.id === credential.id) {
                      return (
                        <form
                          key={credential.id}
                          onSubmit={handleUpdate}
                          className="grid grid-cols-1 items-end gap-3 bg-brand-orange-500/[0.04] px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]"
                        >
                          <label className="space-y-1.5 text-xs font-bold text-zinc-400">
                            Credential type
                            <input
                              required
                              maxLength={80}
                              autoFocus
                              value={editing.credentialType}
                              onChange={(event) =>
                                setEditing((current) =>
                                  current
                                    ? { ...current, credentialType: event.target.value }
                                    : current,
                                )
                              }
                              className={INPUT_CLASS}
                              disabled={busyKey !== null}
                            />
                          </label>
                          <label className="space-y-1.5 text-xs font-bold text-zinc-400">
                            Expiration date
                            <input
                              type="date"
                              value={editing.expirationDate}
                              onChange={(event) =>
                                setEditing((current) =>
                                  current
                                    ? { ...current, expirationDate: event.target.value }
                                    : current,
                                )
                              }
                              className={`${INPUT_CLASS} cursor-pointer [color-scheme:dark]`}
                              disabled={busyKey !== null}
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={busyKey !== null}
                              className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-orange-500 px-4 text-xs font-black text-white transition-all hover:bg-brand-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              disabled={busyKey !== null}
                              className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-300 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        </form>
                      );
                    }

                    return (
                      <div
                        key={credential.id}
                        className="flex flex-col gap-4 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.025] lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-sm font-bold text-zinc-100">
                              {credential.credentialType}
                            </p>
                            <StateBadge state={state} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3 w-3" />
                              {formatDateOnly(credential.expirationDate)}
                            </span>
                            <span>
                              {credential.credentialNumber
                                ? `Number on file: ${credential.credentialNumber}`
                                : 'No credential number stored'}
                            </span>
                            <span>
                              {credential.payerName
                                ? `Payer: ${credential.payerName}`
                                : 'No payer stored'}
                            </span>
                            <span>Updated {formatUpdatedAt(credential.updatedAt)}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() =>
                              setEditing({
                                id: credential.id,
                                credentialType: credential.credentialType,
                                expirationDate: credential.expirationDate ?? '',
                              })
                            }
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-zinc-300 transition-all duration-300 hover:border-brand-orange-500/40 hover:bg-brand-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyKey !== null || state === 'REVOKED'}
                            onClick={() => void handleRevoke(credential)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 text-[11px] font-bold text-amber-300 transition-all duration-300 hover:border-amber-500/40 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isRevoking ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            Revoke
                          </button>
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => void handleDelete(credential)}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 text-[11px] font-bold text-rose-300 transition-all duration-300 hover:border-rose-500/40 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
