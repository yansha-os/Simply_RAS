export const AVAILABILITY_TIME_ZONE = 'America/New_York' as const;
export const AVAILABILITY_SLOT_MINUTES = 60 as const;
export const AVAILABILITY_START_MINUTE = 8 * 60;
export const AVAILABILITY_END_MINUTE = 21 * 60;
export const AVAILABILITY_SLOT_COUNT = 13;

export const AVAILABILITY_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const AVAILABILITY_HOURS = [
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
] as const;

export const NYC_BOROUGHS = [
  'Brooklyn',
  'Queens',
  'Manhattan',
  'Bronx',
  'Staten Island',
] as const;

export const TRANSPORT_MODES = ['CAR', 'PUBLIC_TRANSIT', 'WALKING'] as const;

export type AvailabilityGrid = boolean[][];
export type AvailabilityTransport = (typeof TRANSPORT_MODES)[number];
export type AvailabilityBorough = (typeof NYC_BOROUGHS)[number];

export type WeeklyAvailabilityWindow = {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  dayOfWeek: number;
  /** Inclusive wall-clock minute in America/New_York. */
  startMinute: number;
  /** Exclusive wall-clock minute in America/New_York. */
  endMinute: number;
};

export type WeeklyAvailabilityPayload = {
  version: 1;
  timeZone: typeof AVAILABILITY_TIME_ZONE;
  slotMinutes: typeof AVAILABILITY_SLOT_MINUTES;
  windows: WeeklyAvailabilityWindow[];
};

export type AvailabilitySubmission = {
  availability: unknown;
  preferredBoroughs: unknown;
  transportation: unknown;
  maxTravelMiles: unknown;
};

export type ValidatedAvailabilitySubmission = {
  availability: WeeklyAvailabilityPayload;
  preferredBoroughs: AvailabilityBorough[];
  transportation: AvailabilityTransport;
  maxTravelMiles: number;
  totalHours: number;
};

export type AvailabilitySnapshot = {
  canPersist: boolean;
  canEdit: boolean;
  isHired: boolean;
  stage: string;
  saved: boolean;
  needsRepair: boolean;
  grid: AvailabilityGrid;
  preferredBoroughs: AvailabilityBorough[];
  transportation: AvailabilityTransport;
  maxTravelMiles: number;
  updatedAt: string | null;
};

export type AvailabilityResult =
  | { success: true; data: AvailabilitySnapshot }
  | {
      success: false;
      error: string;
      code: 'IDENTITY_REQUIRED' | 'PROFILE_NOT_FOUND' | 'FORBIDDEN' | 'LOAD_FAILED';
    };

export type SaveAvailabilityResult =
  | { success: true; data: AvailabilitySnapshot }
  | {
      success: false;
      error: string;
      code: 'IDENTITY_REQUIRED' | 'PROFILE_NOT_FOUND' | 'FORBIDDEN' | 'INVALID_INPUT' | 'SAVE_FAILED';
    };

export type AvailabilityPacketSource = {
  availabilityDone?: boolean | null;
  availabilityGrid?: unknown;
  preferredBoroughs?: unknown;
  transportation?: string | null;
  maxTravelMiles?: number | null;
  updatedAt?: Date | string | null;
} | null;

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isAvailabilityBorough(value: unknown): value is AvailabilityBorough {
  return typeof value === 'string' && NYC_BOROUGHS.some((borough) => borough === value);
}

function isAvailabilityTransport(value: unknown): value is AvailabilityTransport {
  return (
    typeof value === 'string' && TRANSPORT_MODES.some((transport) => transport === value)
  );
}

function parseAvailabilityPayload(raw: unknown): ValidationResult<WeeklyAvailabilityPayload> {
  const root = asRecord(raw);

  if (
    root.version !== 1 ||
    root.slotMinutes !== AVAILABILITY_SLOT_MINUTES ||
    !Array.isArray(root.windows)
  ) {
    return { ok: false, error: 'Availability data is invalid.' };
  }

  if (root.timeZone !== AVAILABILITY_TIME_ZONE) {
    return {
      ok: false,
      error: `Availability must use ${AVAILABILITY_TIME_ZONE} time.`,
    };
  }

  if (root.windows.length === 0) {
    return { ok: false, error: 'Select at least one open hour.' };
  }

  if (root.windows.length > AVAILABILITY_DAYS.length * AVAILABILITY_SLOT_COUNT) {
    return { ok: false, error: 'Availability contains too many windows.' };
  }

  const windows: WeeklyAvailabilityWindow[] = [];
  for (const rawWindow of root.windows) {
    const window = asRecord(rawWindow);
    const dayOfWeek = window.dayOfWeek;
    const startMinute = window.startMinute;
    const endMinute = window.endMinute;

    if (
      !Number.isInteger(dayOfWeek) ||
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      (dayOfWeek as number) < 1 ||
      (dayOfWeek as number) > 7 ||
      (startMinute as number) < AVAILABILITY_START_MINUTE ||
      (endMinute as number) > AVAILABILITY_END_MINUTE ||
      (startMinute as number) >= (endMinute as number) ||
      (startMinute as number) % AVAILABILITY_SLOT_MINUTES !== 0 ||
      (endMinute as number) % AVAILABILITY_SLOT_MINUTES !== 0
    ) {
      return {
        ok: false,
        error: 'Availability windows must use one-hour slots from 8:00 AM through 9:00 PM ET.',
      };
    }

    windows.push({
      dayOfWeek: dayOfWeek as number,
      startMinute: startMinute as number,
      endMinute: endMinute as number,
    });
  }

  windows.sort(
    (left, right) =>
      left.dayOfWeek - right.dayOfWeek ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute
  );

  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1];
    const current = windows[index];
    if (
      current.dayOfWeek === previous.dayOfWeek &&
      current.startMinute < previous.endMinute
    ) {
      return { ok: false, error: 'Availability windows cannot overlap.' };
    }
  }

  return {
    ok: true,
    value: {
      version: 1,
      timeZone: AVAILABILITY_TIME_ZONE,
      slotMinutes: AVAILABILITY_SLOT_MINUTES,
      windows,
    },
  };
}

export function emptyAvailabilityGrid(): AvailabilityGrid {
  return Array.from({ length: AVAILABILITY_DAYS.length }, () =>
    Array(AVAILABILITY_SLOT_COUNT).fill(false)
  );
}

function readLegacyGrid(raw: unknown): AvailabilityGrid | null {
  if (
    !Array.isArray(raw) ||
    raw.length !== AVAILABILITY_DAYS.length ||
    raw.some((row) => !Array.isArray(row) || row.length !== AVAILABILITY_SLOT_COUNT)
  ) {
    return null;
  }

  return raw.map((row) => (row as unknown[]).map((cell) => cell === true));
}

export function readAvailabilityGrid(raw: unknown): AvailabilityGrid {
  const legacy = readLegacyGrid(raw);
  if (legacy) return legacy;

  const parsed = parseAvailabilityPayload(raw);
  if (!parsed.ok) return emptyAvailabilityGrid();

  const grid = emptyAvailabilityGrid();
  for (const window of parsed.value.windows) {
    const dayIndex = window.dayOfWeek - 1;
    for (
      let minute = window.startMinute;
      minute < window.endMinute;
      minute += AVAILABILITY_SLOT_MINUTES
    ) {
      const slotIndex = (minute - AVAILABILITY_START_MINUTE) / AVAILABILITY_SLOT_MINUTES;
      if (slotIndex >= 0 && slotIndex < AVAILABILITY_SLOT_COUNT) {
        grid[dayIndex][slotIndex] = true;
      }
    }
  }
  return grid;
}

export function buildAvailabilityPayload(grid: unknown): WeeklyAvailabilityPayload {
  const normalized = readLegacyGrid(grid) ?? emptyAvailabilityGrid();
  const windows: WeeklyAvailabilityWindow[] = [];

  normalized.forEach((day, dayIndex) => {
    let slotIndex = 0;
    while (slotIndex < AVAILABILITY_SLOT_COUNT) {
      if (!day[slotIndex]) {
        slotIndex += 1;
        continue;
      }

      const startSlot = slotIndex;
      while (slotIndex < AVAILABILITY_SLOT_COUNT && day[slotIndex]) {
        slotIndex += 1;
      }

      windows.push({
        dayOfWeek: dayIndex + 1,
        startMinute:
          AVAILABILITY_START_MINUTE + startSlot * AVAILABILITY_SLOT_MINUTES,
        endMinute: AVAILABILITY_START_MINUTE + slotIndex * AVAILABILITY_SLOT_MINUTES,
      });
    }
  });

  return {
    version: 1,
    timeZone: AVAILABILITY_TIME_ZONE,
    slotMinutes: AVAILABILITY_SLOT_MINUTES,
    windows,
  };
}

export function countAvailabilityHours(grid: AvailabilityGrid): number {
  return grid.reduce((total, day) => total + day.filter(Boolean).length, 0);
}

export function createAvailabilitySnapshot(input: {
  stage: string;
  packet: AvailabilityPacketSource;
}): AvailabilitySnapshot {
  const grid = readAvailabilityGrid(input.packet?.availabilityGrid);
  const preferredBoroughs = Array.isArray(input.packet?.preferredBoroughs)
    ? ([
        ...new Set(input.packet.preferredBoroughs.filter(isAvailabilityBorough)),
      ] as AvailabilityBorough[])
    : [];
  const transportation = isAvailabilityTransport(input.packet?.transportation)
    ? input.packet.transportation
    : 'CAR';
  const maxTravelMiles =
    Number.isInteger(input.packet?.maxTravelMiles) &&
    (input.packet?.maxTravelMiles as number) >= 3 &&
    (input.packet?.maxTravelMiles as number) <= 25
      ? (input.packet?.maxTravelMiles as number)
      : 10;
  const hasCompleteProfile =
    countAvailabilityHours(grid) > 0 &&
    preferredBoroughs.length > 0 &&
    isAvailabilityTransport(input.packet?.transportation) &&
    maxTravelMiles === input.packet?.maxTravelMiles;
  const saved = input.packet?.availabilityDone === true && hasCompleteProfile;
  const updatedAtValue = input.packet?.updatedAt;
  const updatedAt =
    updatedAtValue instanceof Date
      ? updatedAtValue.toISOString()
      : typeof updatedAtValue === 'string' && !Number.isNaN(Date.parse(updatedAtValue))
        ? new Date(updatedAtValue).toISOString()
        : null;

  return {
    canPersist: input.packet !== null,
    canEdit: input.stage !== 'REJECTED',
    isHired: input.stage === 'HIRED',
    stage: input.stage,
    saved,
    needsRepair: input.packet?.availabilityDone === true && !saved,
    grid,
    preferredBoroughs,
    transportation,
    maxTravelMiles,
    updatedAt,
  };
}

export function validateAvailabilitySubmission(
  input: unknown
): ValidationResult<ValidatedAvailabilitySubmission> {
  const root = asRecord(input);
  const availability = parseAvailabilityPayload(root.availability);
  if (!availability.ok) return availability;

  if (!Array.isArray(root.preferredBoroughs) || root.preferredBoroughs.length === 0) {
    return { ok: false, error: 'Select at least one preferred borough.' };
  }
  if (!root.preferredBoroughs.every(isAvailabilityBorough)) {
    return { ok: false, error: 'Select only supported NYC boroughs.' };
  }
  const preferredBoroughs = [...new Set(root.preferredBoroughs)] as AvailabilityBorough[];

  if (!isAvailabilityTransport(root.transportation)) {
    return { ok: false, error: 'Select a valid transportation mode.' };
  }

  if (
    !Number.isInteger(root.maxTravelMiles) ||
    (root.maxTravelMiles as number) < 3 ||
    (root.maxTravelMiles as number) > 25
  ) {
    return {
      ok: false,
      error: 'Travel distance must be a whole number from 3 to 25 miles.',
    };
  }

  const totalMinutes = availability.value.windows.reduce(
    (total, window) => total + window.endMinute - window.startMinute,
    0
  );

  return {
    ok: true,
    value: {
      availability: availability.value,
      preferredBoroughs,
      transportation: root.transportation,
      maxTravelMiles: root.maxTravelMiles as number,
      totalHours: totalMinutes / AVAILABILITY_SLOT_MINUTES,
    },
  };
}
