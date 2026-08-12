import { describe, expect, it } from 'vitest';

import {
  resolveActiveClientProfileTab,
  resolveRequestedClientProfileTab,
  shouldShowStaffingIntegrityTab,
} from '../clientProfileTabs';

describe('shouldShowStaffingIntegrityTab', () => {
  it('shows the audit only in Case Coordination from Treatment PA approval onward', () => {
    expect(shouldShowStaffingIntegrityTab('case-coord', 'TX_PA_SUBMITTED')).toBe(false);
    expect(shouldShowStaffingIntegrityTab('case-coord', 'TX_PA_APPROVED')).toBe(true);
    expect(shouldShowStaffingIntegrityTab('case-coord', 'STAFFING_PENDING')).toBe(true);
    expect(shouldShowStaffingIntegrityTab('case-coord', 'ACTIVE')).toBe(true);
    expect(shouldShowStaffingIntegrityTab('case-coord', 'DISCHARGED')).toBe(true);
  });

  it('does not expose the audit through legacy HR or unknown contexts', () => {
    expect(shouldShowStaffingIntegrityTab('hr', 'STAFFING_PENDING')).toBe(false);
    expect(shouldShowStaffingIntegrityTab(undefined, 'STAFFING_PENDING')).toBe(false);
    expect(shouldShowStaffingIntegrityTab('case-coord', 'NOT_A_STATUS')).toBe(false);
  });
});

describe('resolveRequestedClientProfileTab', () => {
  it('keeps the existing staffing deep link on the operational Case Coord surface', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'case-coord',
        queryTab: 'staffing',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: true,
      })
    ).toBe('case_coord_scheduling');
  });

  it('opens the integrity audit only when its status gate is satisfied', () => {
    const input = {
      mode: 'case-coord',
      queryTab: 'staffing_integrity',
      hasP2PAlert: false,
      showChartProgressTab: false,
    } as const;

    expect(
      resolveRequestedClientProfileTab({
        ...input,
        showStaffingIntegrityTab: true,
      })
    ).toBe('staffing_integrity');
    expect(
      resolveRequestedClientProfileTab({
        ...input,
        showStaffingIntegrityTab: false,
      })
    ).toBe('case_coord_scheduling');
  });

  it('lets an explicit BCBA deep link win over the P2P alert default', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'bcba',
        queryTab: 'clinical_goals',
        hasP2PAlert: true,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('clinical_goals');
  });

  it('defaults BCBA mode to P2P only when no explicit tab was requested', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'bcba',
        hasP2PAlert: true,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('p2p');
  });
});

describe('resolveActiveClientProfileTab', () => {
  it('uses a new query-mode default instead of stale local selection', () => {
    expect(
      resolveActiveClientProfileTab(
        { contextKey: 'client-1|case-coord|staffing', tab: 'overview' },
        'client-1|billing|billing',
        'billing'
      )
    ).toBe('billing');
  });

  it('keeps a user selection while the query-mode context is unchanged', () => {
    expect(
      resolveActiveClientProfileTab(
        { contextKey: 'client-1|case-coord|staffing', tab: 'documents' },
        'client-1|case-coord|staffing',
        'case_coord_scheduling'
      )
    ).toBe('documents');
  });
});
