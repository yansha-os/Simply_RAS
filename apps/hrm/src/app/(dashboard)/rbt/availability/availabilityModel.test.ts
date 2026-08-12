import { describe, expect, it } from 'vitest';

import {
  AVAILABILITY_TIME_ZONE,
  buildAvailabilityPayload,
  createAvailabilitySnapshot,
  emptyAvailabilityGrid,
  readAvailabilityGrid,
  validateAvailabilitySubmission,
} from './availabilityModel';

describe('buildAvailabilityPayload', () => {
  it('stores recurring wall-clock windows in Eastern Time and merges adjacent hours', () => {
    const grid = emptyAvailabilityGrid();
    grid[0][0] = true;
    grid[0][1] = true;
    grid[1][4] = true;

    expect(buildAvailabilityPayload(grid)).toEqual({
      version: 1,
      timeZone: AVAILABILITY_TIME_ZONE,
      slotMinutes: 60,
      windows: [
        { dayOfWeek: 1, startMinute: 480, endMinute: 600 },
        { dayOfWeek: 2, startMinute: 720, endMinute: 780 },
      ],
    });
  });
});

describe('readAvailabilityGrid', () => {
  it('reads the canonical ET payload back into the weekly grid', () => {
    const grid = readAvailabilityGrid({
      version: 1,
      timeZone: AVAILABILITY_TIME_ZONE,
      slotMinutes: 60,
      windows: [{ dayOfWeek: 7, startMinute: 1200, endMinute: 1260 }],
    });

    expect(grid[6][12]).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(1);
  });

  it('keeps legacy persisted boolean grids readable', () => {
    const legacy = emptyAvailabilityGrid();
    legacy[3][6] = true;

    expect(readAvailabilityGrid(legacy)).toEqual(legacy);
  });

  it('fails closed for malformed persisted data', () => {
    expect(readAvailabilityGrid({ version: 1, timeZone: 'UTC', windows: [] })).toEqual(
      emptyAvailabilityGrid()
    );
  });
});

describe('validateAvailabilitySubmission', () => {
  const validProfile = {
    preferredBoroughs: ['Queens'],
    transportation: 'PUBLIC_TRANSIT',
    maxTravelMiles: 12,
  };

  it('fails closed for a malformed action payload', () => {
    expect(validateAvailabilitySubmission(null)).toEqual({
      ok: false,
      error: 'Availability data is invalid.',
    });
  });

  it('rejects overlapping windows even when a client bypasses the grid UI', () => {
    const result = validateAvailabilitySubmission({
      ...validProfile,
      availability: {
        version: 1,
        timeZone: AVAILABILITY_TIME_ZONE,
        slotMinutes: 60,
        windows: [
          { dayOfWeek: 1, startMinute: 480, endMinute: 600 },
          { dayOfWeek: 1, startMinute: 540, endMinute: 660 },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Availability windows cannot overlap.',
    });
  });

  it('accepts adjacent windows and returns a sorted canonical payload', () => {
    const result = validateAvailabilitySubmission({
      ...validProfile,
      availability: {
        version: 1,
        timeZone: AVAILABILITY_TIME_ZONE,
        slotMinutes: 60,
        windows: [
          { dayOfWeek: 2, startMinute: 600, endMinute: 660 },
          { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
          { dayOfWeek: 1, startMinute: 480, endMinute: 540 },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.availability.windows).toEqual([
      { dayOfWeek: 1, startMinute: 480, endMinute: 540 },
      { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
      { dayOfWeek: 2, startMinute: 600, endMinute: 660 },
    ]);
    expect(result.value.totalHours).toBe(3);
  });

  it('rejects the wrong timezone and invalid travel preferences', () => {
    const grid = emptyAvailabilityGrid();
    grid[0][0] = true;
    const availability = buildAvailabilityPayload(grid);

    expect(
      validateAvailabilitySubmission({
        ...validProfile,
        availability: { ...availability, timeZone: 'UTC' },
      })
    ).toEqual({
      ok: false,
      error: 'Availability must use America/New_York time.',
    });

    expect(
      validateAvailabilitySubmission({
        ...validProfile,
        availability,
        preferredBoroughs: [],
      })
    ).toEqual({
      ok: false,
      error: 'Select at least one preferred borough.',
    });

    expect(
      validateAvailabilitySubmission({
        ...validProfile,
        availability,
        maxTravelMiles: 26,
      })
    ).toEqual({
      ok: false,
      error: 'Travel distance must be a whole number from 3 to 25 miles.',
    });
  });
});

describe('createAvailabilitySnapshot', () => {
  const grid = emptyAvailabilityGrid();
  grid[0][0] = true;
  const packet = {
    availabilityDone: true,
    availabilityGrid: buildAvailabilityPayload(grid),
    preferredBoroughs: ['Queens'],
    transportation: 'CAR',
    maxTravelMiles: 10,
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
  };

  it('unlocks hired-only navigation from the persisted ATS stage only', () => {
    expect(createAvailabilitySnapshot({ stage: 'OFFER', packet }).isHired).toBe(false);
    expect(createAvailabilitySnapshot({ stage: 'HIRED', packet }).isHired).toBe(true);
  });

  it('keeps hired availability editable but locks rejected profiles', () => {
    expect(createAvailabilitySnapshot({ stage: 'HIRED', packet }).canEdit).toBe(true);
    expect(createAvailabilitySnapshot({ stage: 'REJECTED', packet }).canEdit).toBe(false);
  });

  it('does not call malformed database state saved', () => {
    const snapshot = createAvailabilitySnapshot({
      stage: 'PHONE_SCREEN',
      packet: {
        ...packet,
        availabilityGrid: [],
      },
    });

    expect(snapshot.saved).toBe(false);
    expect(snapshot.needsRepair).toBe(true);
  });

  it('reports an honest unavailable state when no packet exists', () => {
    const snapshot = createAvailabilitySnapshot({ stage: 'HIRED', packet: null });

    expect(snapshot.canPersist).toBe(false);
    expect(snapshot.saved).toBe(false);
    expect(snapshot.updatedAt).toBeNull();
  });
});
