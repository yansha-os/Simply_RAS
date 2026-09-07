import { describe, expect, it } from 'vitest';

import {
  billingPaQueueHref,
  billingProfileHref,
  getBillingTabVisibility,
  getClinicalSupportTabVisibility,
  getDefaultBillingTab,
  getDefaultClinicalSupportTab,
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

  it('defaults clinical support mode to the Clinical Review tab', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('clinical');
  });

  it('defaults clinical support mode by pipeline stage when status is known', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        clientStatus: 'PA_APPROVED',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('assessment');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        clientStatus: 'REPORT_ASSEMBLED',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_handoff');
  });

  it('opens clinical support workflow tabs from deep links', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        queryTab: 'report',
        clientStatus: 'ASSESSMENT_SCHEDULED',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('report');
  });

  it('opens clinical review from a tab deep link without mode', () => {
    expect(
      resolveRequestedClientProfileTab({
        queryTab: 'clinical',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('clinical');
  });

  it('defaults billing mode by workflow stage and maps legacy document links', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        clientStatus: 'CLINICAL_REVIEW_APPROVED',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_vob');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        queryTab: 'documents',
        clientStatus: 'ACTIVE',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_documents');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        queryTab: 'billing_documents',
        clientStatus: 'ACTIVE',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_documents');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        queryTab: 'messages',
        clientStatus: 'ACTIVE',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('session_notes');
  });
});

describe('clinical support workflow tabs', () => {
  it('reveals handoff tabs progressively by client status', () => {
    expect(getClinicalSupportTabVisibility('DOCS_APPROVED_INTAKE')).toMatchObject({
      clinical: true,
      assessment: false,
      report: false,
      billing_handoff: false,
      documents: false,
    });
    expect(getClinicalSupportTabVisibility('PA_APPROVED')).toMatchObject({
      clinical: true,
      assessment: true,
      report: false,
      documents: false,
    });
    expect(getClinicalSupportTabVisibility('REPORT_ASSEMBLED')).toMatchObject({
      clinical: true,
      assessment: true,
      report: true,
      billing_handoff: true,
      documents: false,
    });
  });

  it('redirects legacy documents deep links to the workflow default', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        queryTab: 'documents',
        clientStatus: 'DOCS_APPROVED_INTAKE',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      }),
    ).toBe('clinical');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        queryTab: 'documents',
        clientStatus: 'PA_APPROVED',
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      }),
    ).toBe('assessment');
  });

  it('does not open clinical goals or chart progress in clinical support mode', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        queryTab: 'clinical_goals',
        clientStatus: 'ACTIVE',
        hasP2PAlert: false,
        showChartProgressTab: true,
        showStaffingIntegrityTab: false,
      }),
    ).toBe('clinical');

    expect(
      resolveRequestedClientProfileTab({
        mode: 'clinical',
        queryTab: 'chart_progress',
        clientStatus: 'ACTIVE',
        hasP2PAlert: false,
        showChartProgressTab: true,
        showStaffingIntegrityTab: false,
      }),
    ).toBe('clinical');
  });

  it('defaults each handoff stage to its workflow tab', () => {
    expect(getDefaultClinicalSupportTab('DOCS_APPROVED_INTAKE')).toBe('clinical');
    expect(getDefaultClinicalSupportTab('PA_APPROVED')).toBe('assessment');
    expect(getDefaultClinicalSupportTab('ASSESSMENT_SCHEDULED')).toBe('report');
    expect(getDefaultClinicalSupportTab('REPORT_ASSEMBLED')).toBe('billing_handoff');
  });
});

describe('billing workflow tabs', () => {
  it('shows VOB after clinical review and Assessment PA only after VOB', () => {
    expect(
      getBillingTabVisibility({
        clientStatus: 'CLINICAL_REVIEW_APPROVED',
        showSessionNotesTab: false,
      })
    ).toMatchObject({
      billing_vob: true,
      billing_assessment_pa: false,
    });

    expect(
      getBillingTabVisibility({
        clientStatus: 'VOB_COMPLETED',
        showSessionNotesTab: false,
      })
    ).toMatchObject({
      billing_vob: true,
      billing_assessment_pa: true,
    });
  });

  it('deep-links PA queue lanes to VOB or Assessment PA tabs', () => {
    expect(billingPaQueueHref('abc', 'ASSESSMENT', true)).toBe(
      '/client/abc?mode=billing&tab=vob'
    );
    expect(billingPaQueueHref('abc', 'ASSESSMENT', false)).toBe(
      '/client/abc?mode=billing&tab=assessment_pa'
    );
    expect(billingPaQueueHref('abc', 'TREATMENT')).toBe(
      '/client/abc?mode=billing&tab=treatment_pa'
    );
    expect(billingProfileHref('abc', 'CLINICAL_REVIEW_APPROVED')).toBe(
      '/client/abc?mode=billing&tab=vob'
    );
    expect(billingProfileHref('abc', 'VOB_COMPLETED')).toBe(
      '/client/abc?mode=billing&tab=assessment_pa'
    );
  });

  it('hides PA/auth tabs for active claims work', () => {
    const visibility = getBillingTabVisibility({
      clientStatus: 'ACTIVE',
      showSessionNotesTab: true,
    });

    expect(visibility.session_notes).toBe(true);
    expect(visibility.billing_vob).toBe(false);
    expect(visibility.billing_assessment_pa).toBe(false);
    expect(visibility.billing_treatment_pa).toBe(false);
    expect(visibility.billing_auth_units).toBe(false);
    expect(visibility.billing_documents).toBe(true);
  });

  it('defaults active billing clients to claims tab', () => {
    expect(
      getDefaultBillingTab({
        clientStatus: 'ACTIVE',
        showSessionNotesTab: true,
      })
    ).toBe('session_notes');
  });

  it('defaults treatment PA queue clients to the treatment tab', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        clientStatus: 'REPORT_ASSEMBLED',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_treatment_pa');
  });

  it('maps legacy billing deep links to the workflow default', () => {
    expect(
      resolveRequestedClientProfileTab({
        mode: 'billing',
        queryTab: 'billing',
        clientStatus: 'TX_PA_APPROVED',
        showSessionNotesTab: true,
        hasP2PAlert: false,
        showChartProgressTab: false,
        showStaffingIntegrityTab: false,
      })
    ).toBe('billing_auth_units');
  });
});

describe('resolveActiveClientProfileTab', () => {
  it('uses a new query-mode default instead of stale local selection', () => {
    expect(
      resolveActiveClientProfileTab(
        { contextKey: 'client-1|case-coord|staffing', tab: 'overview' },
        'client-1|billing|session_notes',
        'session_notes'
      )
    ).toBe('session_notes');
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
