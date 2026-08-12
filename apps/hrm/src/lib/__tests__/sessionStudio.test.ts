import { describe, expect, it } from 'vitest';

import * as studioTime from '../sessionStudio';

const { billableUnitsFromSeconds } = studioTime;

type IntervalResult =
  | {
      ok: true;
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
      billableUnits: number;
    }
  | {
      ok: false;
      code: string;
    };

type ResolveInterval = (input: {
  actualStart: Date | string | null | undefined;
  actualEnd: Date | string | null | undefined;
  now?: Date;
}) => IntervalResult;

type ElapsedFromAnchors = (input: {
  startedAt: Date | string | null | undefined;
  endedAt?: Date | string | null;
  nowMs?: number;
}) => number;

function timeExports() {
  return studioTime as typeof studioTime & {
    resolveAuthoritativeSessionInterval?: ResolveInterval;
    elapsedSecondsFromDurableAnchors?: ElapsedFromAnchors;
  };
}

const sec = (minutes: number) => minutes * 60;

describe('billableUnitsFromSeconds — 8-minute rule (audit H1/H2 parity)', () => {
  it('returns 0 below the 8-minute floor', () => {
    expect(billableUnitsFromSeconds(0)).toBe(0);
    expect(billableUnitsFromSeconds(sec(7))).toBe(0);
    expect(billableUnitsFromSeconds(sec(8) - 1)).toBe(0); // 7 min 59 s floors to 7 min
  });

  it('matches the CMS tier boundaries', () => {
    expect(billableUnitsFromSeconds(sec(8))).toBe(1);
    expect(billableUnitsFromSeconds(sec(22))).toBe(1);
    expect(billableUnitsFromSeconds(sec(23))).toBe(2);
    expect(billableUnitsFromSeconds(sec(53))).toBe(4);
    expect(billableUnitsFromSeconds(sec(60))).toBe(4); // 1-hour session = 4 units
  });

  it('counts correctly past 97 minutes (98–104 min must be 7 units, matching CRM)', () => {
    expect(billableUnitsFromSeconds(sec(97))).toBe(6);
    expect(billableUnitsFromSeconds(sec(98))).toBe(7);
    expect(billableUnitsFromSeconds(sec(104))).toBe(7);
    expect(billableUnitsFromSeconds(sec(105))).toBe(7);
    expect(billableUnitsFromSeconds(sec(112))).toBe(7);
    expect(billableUnitsFromSeconds(sec(113))).toBe(8);
  });
});

describe('authoritative Session / EVV interval', () => {
  it('derives duration and units only from persisted start and end anchors', () => {
    const resolve = timeExports().resolveAuthoritativeSessionInterval;
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(
      resolve({
        actualStart: new Date('2026-08-12T14:00:00.000Z'),
        actualEnd: new Date('2026-08-12T15:00:00.000Z'),
        now: new Date('2026-08-12T15:00:01.000Z'),
      })
    ).toEqual({
      ok: true,
      startedAt: '2026-08-12T14:00:00.000Z',
      endedAt: '2026-08-12T15:00:00.000Z',
      durationSeconds: 3_600,
      billableUnits: 4,
    });
  });

  it.each([
    {
      name: 'missing start',
      actualStart: null,
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      code: 'SESSION_TIME_MISSING',
    },
    {
      name: 'missing end',
      actualStart: new Date('2026-08-12T14:00:00.000Z'),
      actualEnd: null,
      code: 'SESSION_TIME_MISSING',
    },
    {
      name: 'reversed interval',
      actualStart: new Date('2026-08-12T15:00:00.000Z'),
      actualEnd: new Date('2026-08-12T14:59:59.000Z'),
      code: 'SESSION_TIME_REVERSED',
    },
    {
      name: 'implausible interval',
      actualStart: new Date('2026-08-11T14:00:00.000Z'),
      actualEnd: new Date('2026-08-12T15:00:00.000Z'),
      code: 'SESSION_DURATION_IMPLAUSIBLE',
    },
  ])('returns a typed conflict for $name', ({ actualStart, actualEnd, code }) => {
    const resolve = timeExports().resolveAuthoritativeSessionInterval;
    expect(resolve).toBeTypeOf('function');
    if (!resolve) return;

    expect(
      resolve({
        actualStart,
        actualEnd,
        now: new Date('2026-08-12T15:00:01.000Z'),
      })
    ).toMatchObject({ ok: false, code });
  });
});

describe('durable-anchor display timer', () => {
  it('jumps to wall-clock elapsed time after a throttled/background interval', () => {
    const elapsed = timeExports().elapsedSecondsFromDurableAnchors;
    expect(elapsed).toBeTypeOf('function');
    if (!elapsed) return;

    expect(
      elapsed({
        startedAt: '2026-08-12T14:00:00.000Z',
        nowMs: Date.parse('2026-08-12T14:10:30.000Z'),
      })
    ).toBe(630);
  });

  it('freezes display elapsed time at the durable clock-out anchor', () => {
    const elapsed = timeExports().elapsedSecondsFromDurableAnchors;
    expect(elapsed).toBeTypeOf('function');
    if (!elapsed) return;

    expect(
      elapsed({
        startedAt: '2026-08-12T14:00:00.000Z',
        endedAt: '2026-08-12T14:05:00.000Z',
        nowMs: Date.parse('2026-08-12T18:00:00.000Z'),
      })
    ).toBe(300);
  });
});
