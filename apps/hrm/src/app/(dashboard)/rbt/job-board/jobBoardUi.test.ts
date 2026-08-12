import { describe, expect, it } from 'vitest';

import type { DeidentifiedCaseOpening } from '@/app/actions/caseOpeningActions';
import {
  filterJobBoardListings,
  getApplicationPresentation,
  getJobBoardEmptyKind,
  getMatchPresentation,
  getRadiusSummary,
  toJobBoardListing,
  validateTravelPreferences,
  type JobBoardListing,
} from './jobBoardUi';

function rawOpening(
  overrides: Partial<DeidentifiedCaseOpening> = {}
): DeidentifiedCaseOpening {
  return {
    id: 'opening-1',
    caseCode: 'CASE-1042',
    clientInitials: 'AB',
    childAge: 8,
    ageBand: 'School age',
    borough: 'Queens',
    neighborhood: 'Jackson Heights',
    zipCode: '11372',
    weeklyHours: 15,
    scheduleText: 'Weekday afternoons',
    daysOfWeek: 'Mon, Wed, Fri',
    sessionLengthMinutes: 180,
    transportationNotes: 'Near the family home',
    languagePref: 'Spanish',
    genderPref: null,
    serviceSetting: 'Home',
    listingHighlights: 'Child attends a named local school',
    bcbaDisplayName: 'Clinical Team A',
    status: 'OPEN',
    matchScore: 92,
    distanceMiles: 0,
    etaMinutes: 8,
    matchReason: 'Same ZIP as listing (11372) · 15 hrs/wk is a solid caseload',
    recommended: true,
    zipMatchKind: 'exact',
    zipMatchLabel: 'Same ZIP',
    zipRoute: '11372 → 11372',
    withinRadius: true,
    commuteMethod: 'zip-centroid',
    myApplication: null,
    ...overrides,
  };
}

function listing(
  overrides: Partial<JobBoardListing> = {}
): JobBoardListing {
  return {
    ...toJobBoardListing(rawOpening()),
    ...overrides,
  };
}

describe('toJobBoardListing', () => {
  it('whitelists job-fit fields and removes direct or free-text client identifiers', () => {
    const result = toJobBoardListing(rawOpening());
    const serialized = JSON.stringify(result);

    expect(result.hasListingZip).toBe(true);
    expect(result.matchReason).toBe(
      'Strong local commute fit · 15 hrs/wk is a solid caseload'
    );
    expect(result.zipMatchKind).toBe('centroid');
    expect(result.zipMatchLabel).toBe('ZIP commute estimate');
    expect(result).not.toHaveProperty('clientInitials');
    expect(result).not.toHaveProperty('childAge');
    expect(result).not.toHaveProperty('neighborhood');
    expect(result).not.toHaveProperty('zipCode');
    expect(result).not.toHaveProperty('zipRoute');
    expect(result).not.toHaveProperty('listingHighlights');
    expect(result).not.toHaveProperty('transportationNotes');
    expect(serialized).not.toContain('AB');
    expect(serialized).not.toContain('11372');
    expect(serialized).not.toContain('Same ZIP');
    expect(serialized).not.toContain('named local school');
  });

  it('preserves whether a listing ZIP existed without exposing the ZIP', () => {
    expect(toJobBoardListing(rawOpening({ zipCode: null })).hasListingZip).toBe(false);
  });
});

describe('getMatchPresentation', () => {
  it('describes the helper score as a 99-point fit score, not a percentage', () => {
    expect(getMatchPresentation(listing({ matchScore: 99, recommended: true }))).toEqual({
      scoreText: '99/99',
      scoreLabel: 'Fit score',
      recommendationLabel: 'Recommended',
    });
  });
});

describe('getApplicationPresentation', () => {
  it('only offers apply when no application exists', () => {
    expect(getApplicationPresentation(null)).toMatchObject({
      label: 'Ready to apply',
      canApply: true,
      canWithdraw: false,
      actionLabel: 'Apply to serve',
    });
  });

  it('allows withdrawal only for active application states', () => {
    for (const status of ['APPLIED', 'MESSAGING', 'MEET_SCHEDULED', 'PARENT_PENDING']) {
      expect(getApplicationPresentation(status)).toMatchObject({
        canApply: false,
        canWithdraw: true,
        actionLabel: 'Withdraw application',
      });
    }
  });

  it('surfaces terminal and unknown states without offering invalid mutations', () => {
    expect(getApplicationPresentation('APPROVED')).toMatchObject({
      label: 'Assigned to this family',
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Assigned',
    });
    expect(getApplicationPresentation('REJECTED')).toMatchObject({
      label: 'Not selected for this case',
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Application closed',
    });
    expect(getApplicationPresentation('WITHDRAWN')).toMatchObject({
      label: 'Application withdrawn',
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Withdrawn',
    });
    expect(getApplicationPresentation('UNEXPECTED_STATE')).toMatchObject({
      label: 'Application status unavailable',
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Contact Case Coordination',
    });
  });
});

describe('getRadiusSummary', () => {
  it('does not report zero radius matches when the home ZIP is missing', () => {
    expect(
      getRadiusSummary([listing({ withinRadius: false })], {
        homeZipCode: null,
        maxTravelMiles: 15,
      })
    ).toMatchObject({
      filterLabel: 'Radius needs home ZIP',
      statValue: '—',
      emptyTitle: 'Set a home ZIP to use radius filtering',
    });
  });

  it('distinguishes unavailable estimates from out-of-radius estimates', () => {
    const summary = getRadiusSummary(
      [
        listing({
          id: 'unknown',
          distanceMiles: null,
          etaMinutes: null,
          withinRadius: false,
          hasListingZip: false,
        }),
      ],
      { homeZipCode: '11372', maxTravelMiles: 15 }
    );

    expect(summary).toMatchObject({
      filterLabel: 'No radius estimates',
      statValue: '—',
      emptyTitle: 'No commute estimates are available',
    });
    expect(summary.emptyBody).toContain('location data');
  });

  it('labels radius results as estimates and reports unknown listings separately', () => {
    const summary = getRadiusSummary(
      [
        listing({ id: 'inside', distanceMiles: 4, withinRadius: true }),
        listing({ id: 'outside', distanceMiles: 22, withinRadius: false }),
        listing({ id: 'unknown', distanceMiles: null, withinRadius: false }),
      ],
      { homeZipCode: '11372', maxTravelMiles: 15 }
    );

    expect(summary).toMatchObject({
      filterLabel: 'Estimated within 15 mi',
      statValue: 1,
      emptyTitle: 'Nothing estimated within 15 mi',
    });
    expect(summary.emptyBody).toContain('1 listing has no commute estimate');
  });
});

describe('filterJobBoardListings', () => {
  const withdrawn = listing({
    id: 'withdrawn',
    caseCode: 'CASE-WITHDRAWN',
    myApplication: {
      id: 'application-1',
      status: 'WITHDRAWN',
      meetAt: null,
      meetLink: null,
    },
  });
  const rejected = listing({
    id: 'rejected',
    caseCode: 'CASE-REJECTED',
    myApplication: {
      id: 'application-2',
      status: 'REJECTED',
      meetAt: null,
      meetLink: null,
    },
  });

  it('keeps withdrawn and rejected records in My applications', () => {
    expect(
      filterJobBoardListings([listing(), withdrawn, rejected], {
        searchQuery: '',
        boroughFilter: 'ALL',
        viewFilter: 'MINE',
      }).map((item) => item.id)
    ).toEqual(['withdrawn', 'rejected']);
  });

  it('applies trimmed, case-insensitive search and combined filters', () => {
    const result = filterJobBoardListings(
      [
        listing({ id: 'queens', caseCode: 'QUEENS-42', borough: 'Queens' }),
        listing({ id: 'bronx', caseCode: 'BRONX-42', borough: 'Bronx' }),
      ],
      {
        searchQuery: '  queens ',
        boroughFilter: 'Queens',
        viewFilter: 'ALL',
      }
    );

    expect(result.map((item) => item.id)).toEqual(['queens']);
  });
});

describe('getJobBoardEmptyKind', () => {
  it('prioritizes active search or borough filters over view-specific empty copy', () => {
    expect(
      getJobBoardEmptyKind({
        openingsCount: 3,
        filteredCount: 0,
        searchQuery: 'queens',
        boroughFilter: 'ALL',
        viewFilter: 'RECOMMENDED',
      })
    ).toBe('FILTERED_OUT');
  });

  it('uses view-specific empty copy when no narrowing filter is active', () => {
    expect(
      getJobBoardEmptyKind({
        openingsCount: 3,
        filteredCount: 0,
        searchQuery: '',
        boroughFilter: 'ALL',
        viewFilter: 'RECOMMENDED',
      })
    ).toBe('NO_RECOMMENDED');
    expect(
      getJobBoardEmptyKind({
        openingsCount: 3,
        filteredCount: 0,
        searchQuery: '',
        boroughFilter: 'ALL',
        viewFilter: 'RADIUS',
      })
    ).toBe('NO_RADIUS');
  });
});

describe('validateTravelPreferences', () => {
  it('requires an exact 5-digit ZIP and a whole-mile radius from 1 to 100', () => {
    expect(validateTravelPreferences('1137', '15')).toMatchObject({ success: false });
    expect(validateTravelPreferences('11372', '0')).toMatchObject({ success: false });
    expect(validateTravelPreferences('11372', '15.5')).toMatchObject({ success: false });
    expect(validateTravelPreferences('11372', '101')).toMatchObject({ success: false });
    expect(validateTravelPreferences('11372', '25')).toEqual({
      success: true,
      value: { homeZipCode: '11372', maxTravelMiles: 25 },
    });
  });
});
