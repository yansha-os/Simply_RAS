import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CLINIC_TIME_ZONE,
  clinicDateKey,
  clinicWallTimeToDate,
  endOfClinicDay,
} from '../clinicTimezone';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');

describe('cross-app copy contract', () => {
  it('stays byte-identical with apps/crm/src/lib/clinicTimezone.ts', () => {
    const hrm = readFileSync(
      path.join(repoRoot, 'apps/hrm/src/lib/clinicTimezone.ts'),
      'utf8'
    );
    const crm = readFileSync(
      path.join(repoRoot, 'apps/crm/src/lib/clinicTimezone.ts'),
      'utf8'
    );
    expect(hrm).toBe(crm);
  });
});

describe('HRM clinic timezone smoke checks', () => {
  it('uses the New York clinic timezone', () => {
    expect(CLINIC_TIME_ZONE).toBe('America/New_York');
  });

  it('computes clinic day boundaries independent of host timezone', () => {
    expect(clinicDateKey(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14');
    expect(clinicWallTimeToDate(2026, 7, 15).toISOString()).toBe(
      '2026-07-15T04:00:00.000Z'
    );
    expect(endOfClinicDay(new Date('2026-03-08T17:00:00Z')).toISOString()).toBe(
      '2026-03-09T03:59:59.999Z'
    );
  });
});
