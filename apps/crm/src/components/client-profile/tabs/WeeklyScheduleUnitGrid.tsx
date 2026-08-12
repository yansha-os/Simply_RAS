'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Pencil, Check, RotateCcw, Info } from 'lucide-react';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

export const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayName = (typeof WEEK_DAYS)[number];
export type DaySlot = { start: string; end: string } | null;
export type WeekSchedule = Record<string, DaySlot>;

/**
 * Prospective 97153 planning unit = 15 minutes.
 * These schedule cells do not represent signed-note utilization or burn auth.
 */
export const UNIT_MINUTES = 15;
/** Full 24-hour day: 12:00 AM → 12:00 AM next day */
export const GRID_START_MINUTES = 0;
export const GRID_END_MINUTES = 24 * 60;
export const UNITS_PER_DAY = (GRID_END_MINUTES - GRID_START_MINUTES) / UNIT_MINUTES; // 96

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function minutesToTime24(totalMinutes: number) {
  if (totalMinutes >= 24 * 60) return '24:00';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function time24ToMinutes(time24: string) {
  if (time24 === '24:00') return 24 * 60;
  const [h, m] = time24.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatTime12(time24: string) {
  if (!time24) return '';
  if (time24 === '24:00') return '12:00 AM';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr || '00'} ${period}`;
}

export function emptyUnitGrid(): boolean[][] {
  return Array.from({ length: 7 }, () => Array(UNITS_PER_DAY).fill(false));
}

export function scheduleToUnitGrid(schedule: WeekSchedule): boolean[][] {
  const grid = emptyUnitGrid();
  WEEK_DAYS.forEach((day, dIndex) => {
    const slot = schedule[day];
    if (!slot?.start || !slot?.end) return;
    const start = time24ToMinutes(slot.start);
    let end = time24ToMinutes(slot.end);
    if (end === 0 && start > 0) end = 24 * 60;
    for (let u = 0; u < UNITS_PER_DAY; u++) {
      const cellStart = GRID_START_MINUTES + u * UNIT_MINUTES;
      if (cellStart >= start && cellStart < end) {
        grid[dIndex][u] = true;
      }
    }
  });
  return grid;
}

/** Collapse each day to a contiguous start–end from first→last selected unit. */
export function unitGridToSchedule(grid: boolean[][]): WeekSchedule {
  const out: WeekSchedule = Object.fromEntries(WEEK_DAYS.map((d) => [d, null]));
  WEEK_DAYS.forEach((day, dIndex) => {
    const row = grid[dIndex] || [];
    let first = -1;
    let last = -1;
    for (let u = 0; u < row.length; u++) {
      if (!row[u]) continue;
      if (first < 0) first = u;
      last = u;
    }
    if (first < 0 || last < 0) return;
    out[day] = {
      start: minutesToTime24(GRID_START_MINUTES + first * UNIT_MINUTES),
      end: minutesToTime24(GRID_START_MINUTES + (last + 1) * UNIT_MINUTES),
    };
  });
  return out;
}

export function countSelectedUnits(grid: boolean[][]) {
  return grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

export function unitsToHours(units: number) {
  return Math.round((units / 4) * 100) / 100;
}

export function summarizeWeekSchedule(schedule: WeekSchedule) {
  const active = WEEK_DAYS.filter((d) => schedule[d]?.start && schedule[d]?.end);
  const daysOfWeek = active.map((d) => d.slice(0, 3)).join(' / ');
  const scheduleText = active
    .map((d) => {
      const s = schedule[d]!;
      return `${d.slice(0, 3)} ${formatTime12(s.start)}–${formatTime12(s.end)}`;
    })
    .join(' · ');
  return { daysOfWeek: daysOfWeek || null, scheduleText: scheduleText || null };
}

function unitLabel(unitIndex: number) {
  const start = GRID_START_MINUTES + unitIndex * UNIT_MINUTES;
  return formatTime12(minutesToTime24(start));
}

type Meridiem = 'AM' | 'PM';

type AmPmParts = {
  hour12: number; // 1–12
  minute: number; // 0, 15, 30, 45
  period: Meridiem;
};

function time24ToAmPm(time24: string): AmPmParts {
  const mins = time24ToMinutes(time24 === '24:00' ? '00:00' : time24);
  const h24 = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const period: Meridiem = h24 >= 12 ? 'PM' : 'AM';
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  const snapped = [0, 15, 30, 45].includes(minute) ? minute : Math.round(minute / 15) * 15 % 60;
  return { hour12, minute: snapped, period };
}

function amPmToTime24(parts: AmPmParts): string {
  let h = parts.hour12 % 12;
  if (parts.period === 'PM') h += 12;
  return minutesToTime24(h * 60 + parts.minute);
}

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTE_OPTIONS = [0, 15, 30, 45];

function TinyDarkMenu({
  label,
  display,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string;
  display: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative z-20 ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-[3.25rem] cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-[#09090b] px-2 py-2 text-sm font-semibold text-white outline-none hover:border-brand-orange-500/40 focus:border-brand-orange-500"
      >
        {display}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute left-0 z-[80] mt-1 max-h-44 min-w-[3.5rem] overflow-auto rounded-lg border border-white/15 bg-[#09090b] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.9)]"
        >
          {options.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full cursor-pointer px-2.5 py-1.5 text-left text-sm font-semibold ${
                  opt.value === value
                    ? 'bg-[#1c1917] text-brand-orange-200'
                    : 'bg-[#09090b] text-zinc-200 hover:bg-[#18181b]'
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AmPmTimePicker({
  label,
  value24,
  onChange24,
}: {
  label: string;
  value24: string;
  onChange24: (next: string) => void;
}) {
  const parts = time24ToAmPm(value24);

  const commit = (next: Partial<AmPmParts>) => {
    onChange24(amPmToTime24({ ...parts, ...next }));
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="flex items-center gap-1.5">
        <TinyDarkMenu
          label={`${label} hour`}
          display={String(parts.hour12)}
          value={parts.hour12}
          onChange={(h) => commit({ hour12: h })}
          options={HOUR_OPTIONS.map((h) => ({ value: h, label: String(h) }))}
        />
        <span className="text-sm font-bold text-zinc-500">:</span>
        <TinyDarkMenu
          label={`${label} minutes`}
          display={pad2(parts.minute)}
          value={parts.minute}
          onChange={(m) => commit({ minute: m })}
          options={MINUTE_OPTIONS.map((m) => ({ value: m, label: pad2(m) }))}
        />
        <div className="ml-0.5 flex overflow-hidden rounded-lg border border-white/10">
          {(['AM', 'PM'] as Meridiem[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={parts.period === p}
              onClick={() => commit({ period: p })}
              className={`cursor-pointer px-2.5 py-2 text-[11px] font-bold transition ${
                parts.period === p
                  ? 'bg-brand-orange-500 text-white'
                  : 'bg-[#09090b] text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <p className="font-mono text-[10px] text-zinc-600">{formatTime12(value24)}</p>
    </div>
  );
}

function paintRangeOnGrid(
  grid: boolean[][],
  dayIndexes: number[],
  startMinutes: number,
  endMinutes: number
): boolean[][] {
  let end = endMinutes;
  if (end === 0 && startMinutes > 0) end = 24 * 60;
  if (end <= startMinutes) return grid;

  const next = grid.map((row) => [...row]);
  const startU = Math.floor((startMinutes - GRID_START_MINUTES) / UNIT_MINUTES);
  const endU = Math.ceil((end - GRID_START_MINUTES) / UNIT_MINUTES);

  for (const d of dayIndexes) {
    if (d < 0 || d > 6) continue;
    for (let u = Math.max(0, startU); u < Math.min(UNITS_PER_DAY, endU); u++) {
      next[d][u] = true;
    }
  }
  return next;
}

function selectedBounds(row: boolean[]): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  for (let u = 0; u < row.length; u++) {
    if (!row[u]) continue;
    if (first < 0) first = u;
    last = u;
  }
  if (first < 0) return null;
  return { first, last };
}

function isContiguous(row: boolean[]): boolean {
  const b = selectedBounds(row);
  if (!b) return true;
  for (let u = b.first; u <= b.last; u++) {
    if (!row[u]) return false;
  }
  return true;
}

/** Paint ON: keep one block per day by filling gaps between existing selection and new cell. */
function paintCellOn(row: boolean[], unitIndex: number): boolean[] {
  const next = [...row];
  next[unitIndex] = true;
  const b = selectedBounds(next);
  if (!b) return next;
  for (let u = b.first; u <= b.last; u++) next[u] = true;
  return next;
}

/**
 * Paint OFF: only trim from the ends of a contiguous block (no holes).
 * Returns null if the erase would punch a middle hole.
 */
function paintCellOff(row: boolean[], unitIndex: number): boolean[] | null {
  if (!row[unitIndex]) return row;
  const b = selectedBounds(row);
  if (!b) return row;
  if (!isContiguous(row)) {
    // Repair then trim if at edge
    const fixed = paintCellOn(row, b.first);
    return paintCellOff(fixed, unitIndex);
  }
  if (unitIndex !== b.first && unitIndex !== b.last) return null;
  const next = [...row];
  next[unitIndex] = false;
  return next;
}

function rangeUnitBounds(startMinutes: number, endMinutes: number) {
  let end = endMinutes;
  if (end === 0 && startMinutes > 0) end = 24 * 60;
  const startU = Math.floor((startMinutes - GRID_START_MINUTES) / UNIT_MINUTES);
  const endU = Math.ceil((end - GRID_START_MINUTES) / UNIT_MINUTES);
  return {
    startU: Math.max(0, startU),
    endU: Math.min(UNITS_PER_DAY, endU),
    end,
  };
}

function rangeOverlapsDay(row: boolean[], startU: number, endU: number): boolean {
  for (let u = startU; u < endU; u++) {
    if (row[u]) return true;
  }
  return false;
}

/** True if day already has a block and the new range is neither empty-overlap nor touching it. */
function rangeDisjointFromDay(row: boolean[], startU: number, endU: number): boolean {
  const b = selectedBounds(row);
  if (!b) return false;
  if (rangeOverlapsDay(row, startU, endU)) return false;
  // adjacent (touching) is allowed — merges into one window
  if (endU === b.first || startU === b.last + 1) return false;
  return true;
}

type Props = {
  value: boolean[][];
  onChange: (next: boolean[][]) => void;
  /** Client portal preferred schedule (for Reset). */
  portalGrid?: boolean[][];
  className?: string;
};

function cloneGrid(grid: boolean[][]) {
  return grid.map((row) => [...row]);
}

function gridsEqual(a: boolean[][], b: boolean[][]) {
  if (a.length !== b.length) return false;
  for (let d = 0; d < a.length; d++) {
    if (a[d].length !== b[d].length) return false;
    for (let u = 0; u < a[d].length; u++) {
      if (a[d][u] !== b[d][u]) return false;
    }
  }
  return true;
}

/**
 * Click/drag weekly schedule grid (full 24h) for case-opening listing hours.
 * Prefills from client portal schedule; locked until Edit.
 * Each cell = one prospective 15-minute planning unit.
 * Billing signed-note week view lives in WeeklyBillableUnitGrid.tsx.
 */
export function WeeklyScheduleUnitGrid({ value, onChange, portalGrid, className = '' }: Props) {
  const [painting, setPainting] = useState(false);
  const paintValueRef = useRef(true);
  const gridRef = useRef(value);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editSnapshotRef = useRef<boolean[][] | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addStart, setAddStart] = useState('10:00');
  const [addEnd, setAddEnd] = useState('16:00');
  const [addDays, setAddDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [addError, setAddError] = useState<string | null>(null);
  const [gridHint, setGridHint] = useState<string | null>(null);

  useEffect(() => {
    gridRef.current = value;
  }, [value]);

  const hasPortalSchedule = useMemo(
    () => (portalGrid ? countSelectedUnits(portalGrid) > 0 : false),
    [portalGrid]
  );
  const matchesPortal = useMemo(
    () => (portalGrid ? gridsEqual(value, portalGrid) : false),
    [portalGrid, value]
  );

  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  // Scroll so ~7 AM is near the top on first mount (still have full 24h)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour7Index = (7 * 60) / UNIT_MINUTES;
    const rowH = 16; // approx h-4
    el.scrollTop = Math.max(0, hour7Index * rowH - 24);
  }, []);

  const applyCell = useCallback(
    (dayIndex: number, unitIndex: number, selected: boolean) => {
      if (!isEditing) return;
      const prev = gridRef.current;
      const row = prev[dayIndex] || [];
      let nextRow: boolean[] | null;
      if (selected) {
        nextRow = paintCellOn(row, unitIndex);
        setGridHint(null);
      } else {
        nextRow = paintCellOff(row, unitIndex);
        if (!nextRow) {
          setGridHint("Can't punch a hole in the middle — trim from the ends, or Clear that day.");
          return;
        }
        setGridHint(null);
      }
      if (row.every((v, i) => v === nextRow![i])) return;
      const next = prev.map((r, i) => (i === dayIndex ? nextRow! : [...r]));
      onChange(next);
    },
    [isEditing, onChange]
  );

  const onCellDown = (dayIndex: number, unitIndex: number) => {
    if (!isEditing) return;
    const nextVal = !value[dayIndex][unitIndex];
    paintValueRef.current = nextVal;
    setPainting(true);
    applyCell(dayIndex, unitIndex, nextVal);
  };

  const onCellEnter = (dayIndex: number, unitIndex: number) => {
    if (!isEditing || !painting) return;
    applyCell(dayIndex, unitIndex, paintValueRef.current);
  };

  const selectedUnits = useMemo(() => countSelectedUnits(value), [value]);
  const hours = unitsToHours(selectedUnits);

  const addStartMins = time24ToMinutes(addStart);
  const addEndMinsRaw = time24ToMinutes(addEnd);
  const addEndMins = addEndMinsRaw === 0 && addStartMins > 0 ? 24 * 60 : addEndMinsRaw;
  const timeOrderInvalid = addEndMins <= addStartMins;

  const liveConflict = useMemo(() => {
    if (timeOrderInvalid) return null;
    const { startU, endU } = rangeUnitBounds(addStartMins, addEndMins);
    if (endU <= startU) return null;
    const overlapDays: string[] = [];
    const disjointDays: string[] = [];
    addDays.forEach((on, i) => {
      if (!on) return;
      const row = value[i] || [];
      if (rangeOverlapsDay(row, startU, endU)) overlapDays.push(WEEK_DAYS[i].slice(0, 3));
      else if (rangeDisjointFromDay(row, startU, endU)) disjointDays.push(WEEK_DAYS[i].slice(0, 3));
    });
    if (overlapDays.length) return `Overlaps existing hours on ${overlapDays.join(', ')}. Clear those cells first or pick another window.`;
    if (disjointDays.length)
      return `${disjointDays.join(', ')} already has hours that don't touch this window. Extend by dragging, clear the day, or choose adjacent times.`;
    return null;
  }, [addDays, addEndMins, addStartMins, timeOrderInvalid, value]);

  const clearAll = () => {
    if (!isEditing) return;
    setGridHint(null);
    setAddError(null);
    onChange(emptyUnitGrid());
  };

  const startEditing = () => {
    editSnapshotRef.current = cloneGrid(value);
    setIsEditing(true);
    setGridHint(null);
    setAddError(null);
  };

  const doneEditing = () => {
    setIsEditing(false);
    setShowAdd(false);
    setGridHint(null);
    setAddError(null);
    editSnapshotRef.current = null;
  };

  const cancelEditing = () => {
    if (editSnapshotRef.current) onChange(cloneGrid(editSnapshotRef.current));
    setIsEditing(false);
    setShowAdd(false);
    setGridHint(null);
    setAddError(null);
    editSnapshotRef.current = null;
  };

  const resetToPortal = () => {
    if (!portalGrid || !isEditing) return;
    onChange(cloneGrid(portalGrid));
    setShowAdd(false);
    setGridHint(null);
    setAddError(null);
  };

  const toggleAddDay = (index: number) => {
    setAddDays((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const applyTypedRange = () => {
    if (!isEditing) return;
    setAddError(null);
    if (!addStart || !addEnd) {
      setAddError('Enter both start and end times.');
      return;
    }
    if (timeOrderInvalid) {
      setAddError('End time must be after start time (can\'t go backwards).');
      return;
    }
    const days = addDays.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    if (days.length === 0) {
      setAddError('Pick at least one day.');
      return;
    }

    const { startU, endU } = rangeUnitBounds(addStartMins, addEndMins);
    if (endU <= startU) {
      setAddError('Time window must cover at least one 15-minute unit.');
      return;
    }

    const overlapDays: string[] = [];
    const disjointDays: string[] = [];
    for (const d of days) {
      const row = value[d] || [];
      if (rangeOverlapsDay(row, startU, endU)) overlapDays.push(WEEK_DAYS[d].slice(0, 3));
      else if (rangeDisjointFromDay(row, startU, endU)) disjointDays.push(WEEK_DAYS[d].slice(0, 3));
    }
    if (overlapDays.length) {
      setAddError(`Overlaps existing hours on ${overlapDays.join(', ')}.`);
      return;
    }
    if (disjointDays.length) {
      setAddError(
        `${disjointDays.join(', ')} already has a separate window. Clear that day or choose times that touch / extend it.`
      );
      return;
    }

    onChange(paintRangeOnGrid(value, days, addStartMins, addEndMins));
    setShowAdd(false);
    setGridHint(null);
  };

  const unitIndexes = useMemo(() => Array.from({ length: UNITS_PER_DAY }, (_, i) => i), []);

  return (
    <div
      aria-label="Weekly case-opening schedule planner"
      className={`space-y-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-3 sm:p-4 ${className}`}
      onMouseLeave={() => setPainting(false)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-white">Weekly listing schedule</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {isEditing
              ? 'Editing listing hours — click & drag cells or use + Add hours. Each cell is 15 planned minutes.'
              : hasPortalSchedule
                ? 'Loaded from the client portal preferred schedule. Click Edit to change hours for this listing.'
                : 'No portal schedule on file yet. Click Edit to plan listing hours.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-brand-orange-500/25 bg-brand-orange-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-brand-orange-300">
            {selectedUnits} planned units · {hours} hrs
          </span>
          {hasPortalSchedule && matchesPortal && !isEditing && (
            <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300">
              From client portal
            </span>
          )}
          {hasPortalSchedule && !matchesPortal && (
            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
              Modified from portal
            </span>
          )}
          {!isEditing ? (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/40 bg-brand-orange-500/15 px-2.5 py-1 text-[10px] font-semibold text-brand-orange-200 transition hover:bg-brand-orange-500/25"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setAddError(null);
                  setShowAdd((v) => !v);
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-brand-orange-500/40 bg-brand-orange-500/15 px-2.5 py-1 text-[10px] font-semibold text-brand-orange-200 transition hover:bg-brand-orange-500/25"
              >
                {showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showAdd ? 'Close' : 'Add hours'}
              </button>
              {hasPortalSchedule && (
                <button
                  type="button"
                  onClick={resetToPortal}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300 transition hover:border-sky-500/50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to portal
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-white/20"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={doneEditing}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <Check className="h-3 w-3" />
                Done
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-white/20"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-sky-500/15 bg-sky-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-sky-100/70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
        <p>
          Planning only · times are clinic-local ({CLINIC_TIME_ZONE}). These cells do not
          reserve authorization, burn units, or appear in signed-note billing totals.
        </p>
      </div>

      {isEditing && showAdd && (
        <div className="space-y-3 rounded-xl border border-brand-orange-500/25 bg-brand-orange-500/5 p-3">
          <p className="text-[11px] font-semibold text-brand-orange-200">
            Type a time window, pick days, then apply — fills empty / adjacent slots only (no overlaps).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AmPmTimePicker label="Start" value24={addStart} onChange24={setAddStart} />
            <AmPmTimePicker label="End" value24={addEnd} onChange24={setAddEnd} />
          </div>

          {timeOrderInvalid && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-300"
            >
              End must be after start — can&apos;t go backwards in time (
              {formatTime12(addStart)} → {formatTime12(addEnd)}).
            </p>
          )}
          {!timeOrderInvalid && liveConflict && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200"
            >
              {liveConflict}
            </p>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_DAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={addDays[i]}
                  onClick={() => toggleAddDay(i)}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    addDays[i]
                      ? 'border-brand-orange-500/50 bg-brand-orange-500/20 text-brand-orange-200'
                      : 'border-white/10 bg-zinc-950 text-zinc-500 hover:border-white/20'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="cursor-pointer text-[10px] font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                onClick={() => setAddDays([true, true, true, true, true, false, false])}
              >
                Weekdays
              </button>
              <button
                type="button"
                className="cursor-pointer text-[10px] font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                onClick={() => setAddDays([true, true, true, true, true, true, true])}
              >
                All days
              </button>
            </div>
          </div>

          {addError && (
            <p role="alert" className="text-[11px] font-medium text-red-400">
              {addError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyTypedRange}
              disabled={timeOrderInvalid || !!liveConflict || !addDays.some(Boolean)}
              className="cursor-pointer rounded-lg bg-brand-orange-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to grid
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 text-xs font-semibold text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gridHint && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200"
        >
          {gridHint}
        </p>
      )}

      <div
        ref={scrollRef}
        className={`max-h-[480px] overflow-auto rounded-xl border border-white/5 ${
          isEditing ? '' : 'opacity-95'
        }`}
      >
        <table className="w-full min-w-[640px] border-collapse select-none text-center">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-16 border border-white/5 bg-zinc-900 px-1 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                Time
              </th>
              {WEEK_DAYS.map((day) => (
                <th
                  key={day}
                  className="border border-white/5 bg-zinc-900 px-1 py-2 font-heading text-[10px] font-bold text-white"
                >
                  {day.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unitIndexes.map((u) => {
              const onHour = u % 4 === 0;
              return (
                <tr key={u}>
                  <td
                    className={`sticky left-0 z-[1] border border-white/5 px-1 py-0 font-mono text-[9px] ${
                      onHour
                        ? 'bg-zinc-900/95 font-bold text-zinc-300'
                        : 'bg-zinc-950/95 text-zinc-600'
                    }`}
                  >
                    {onHour ? unitLabel(u) : '·'}
                  </td>
                  {WEEK_DAYS.map((_, dIndex) => {
                    const on = Boolean(value[dIndex]?.[u]);
                    return (
                      <td
                        key={`${dIndex}-${u}`}
                        className="h-4 border border-white/[0.06] p-0"
                      >
                        <button
                          type="button"
                          aria-label={`${WEEK_DAYS[dIndex]} ${unitLabel(u)} · one planned unit`}
                          aria-pressed={on}
                          disabled={!isEditing}
                          title={
                            isEditing
                              ? `${WEEK_DAYS[dIndex]} ${unitLabel(u)} · one planned unit`
                              : 'Click Edit to change schedule'
                          }
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onCellDown(dIndex, u);
                          }}
                          onMouseEnter={() => onCellEnter(dIndex, u)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            applyCell(dIndex, u, !on);
                            setPainting(false);
                          }}
                          className={`block h-4 w-full border-0 p-0 transition-colors duration-75 disabled:cursor-default disabled:opacity-100 ${
                            isEditing ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            on
                              ? isEditing
                                ? 'bg-brand-orange-500/80 hover:bg-brand-orange-400'
                                : 'bg-brand-orange-500/70'
                              : onHour
                                ? isEditing
                                  ? 'bg-white/[0.03] hover:bg-brand-orange-500/20'
                                  : 'bg-white/[0.03]'
                                : isEditing
                                  ? 'bg-transparent hover:bg-brand-orange-500/15'
                                  : 'bg-transparent'
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[10px] text-zinc-600">
        {isEditing
          ? 'Rules: end after start · one contiguous block per day · no overlapping windows. Trim only from the ends.'
          : 'Read-only listing preview · signed-note billing and authorization burn are computed separately on the server.'}
      </p>
    </div>
  );
}
