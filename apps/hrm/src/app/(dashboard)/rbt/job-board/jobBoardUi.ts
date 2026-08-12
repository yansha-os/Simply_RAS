import type { DeidentifiedCaseOpening } from '@/app/actions/caseOpeningActions';

export type JobBoardViewFilter = 'ALL' | 'RECOMMENDED' | 'RADIUS' | 'MINE';
export type JobBoardEmptyKind =
  | 'NO_OPEN'
  | 'NO_RECOMMENDED'
  | 'NO_RADIUS'
  | 'NO_APPS'
  | 'FILTERED_OUT';

export type JobBoardApplication = {
  id: string;
  status: string;
  meetAt: string | null;
  meetLink: string | null;
};

export type JobBoardListing = {
  id: string;
  caseCode: string;
  ageBand: string | null;
  borough: string | null;
  weeklyHours: number | null;
  scheduleText: string | null;
  daysOfWeek: string | null;
  sessionLengthMinutes: number | null;
  languagePref: string | null;
  genderPref: string | null;
  serviceSetting: string | null;
  bcbaDisplayName: string | null;
  status: string;
  matchScore: number;
  distanceMiles: number | null;
  etaMinutes: number | null;
  matchReason: string;
  recommended: boolean;
  zipMatchKind: string;
  zipMatchLabel: string;
  withinRadius: boolean;
  commuteMethod: string;
  hasListingZip: boolean;
  myApplication: JobBoardApplication | null;
};

export type JobBoardTravelProfile = {
  homeZipCode: string | null;
  maxTravelMiles: number;
  preferredBoroughs: string[];
  transportation: string | null;
};

export type ApplicationPresentation = {
  label: string;
  tone: string;
  step: number;
  canApply: boolean;
  canWithdraw: boolean;
  actionLabel: string;
};

export function toJobBoardListing(
  opening: DeidentifiedCaseOpening
): JobBoardListing {
  const exactZipMatch = opening.zipMatchKind === 'exact';

  return {
    id: opening.id,
    caseCode: opening.caseCode,
    ageBand: opening.ageBand,
    borough: opening.borough,
    weeklyHours: opening.weeklyHours,
    scheduleText: opening.scheduleText,
    daysOfWeek: opening.daysOfWeek,
    sessionLengthMinutes: opening.sessionLengthMinutes,
    languagePref: opening.languagePref,
    genderPref: opening.genderPref,
    serviceSetting: opening.serviceSetting,
    bcbaDisplayName: opening.bcbaDisplayName,
    status: opening.status,
    matchScore: opening.matchScore,
    distanceMiles: opening.distanceMiles,
    etaMinutes: opening.etaMinutes,
    matchReason: opening.matchReason
      .replace(/Same ZIP as listing \(\d{5}\)/g, 'Strong local commute fit')
      .replace(/\b\d{5}(?:-\d{4})?\b/g, 'listing area'),
    recommended: opening.recommended,
    zipMatchKind: exactZipMatch ? 'centroid' : opening.zipMatchKind,
    zipMatchLabel: exactZipMatch ? 'ZIP commute estimate' : opening.zipMatchLabel,
    withinRadius: opening.withinRadius,
    commuteMethod: opening.commuteMethod,
    hasListingZip: Boolean(opening.zipCode),
    myApplication: opening.myApplication
      ? {
          id: opening.myApplication.id,
          status: opening.myApplication.status,
          meetAt: opening.myApplication.meetAt,
          meetLink: opening.myApplication.meetLink,
        }
      : null,
  };
}

export function getMatchPresentation(listing: JobBoardListing) {
  return {
    scoreText: `${listing.matchScore}/99`,
    scoreLabel: 'Fit score',
    recommendationLabel: listing.recommended ? 'Recommended' : null,
  };
}

export function getApplicationPresentation(
  status: string | null
): ApplicationPresentation {
  const available: ApplicationPresentation = {
    label: 'Ready to apply',
    tone: 'border-orange-500/25 bg-orange-500/10 text-orange-950',
    step: 0,
    canApply: true,
    canWithdraw: false,
    actionLabel: 'Apply to serve',
  };
  if (!status) return available;

  const states: Record<string, ApplicationPresentation> = {
    APPLIED: {
      label: 'Applied — waiting on Case Coordination',
      tone: 'border-sky-500/30 bg-sky-500/10 text-sky-900',
      step: 1,
      canApply: false,
      canWithdraw: true,
      actionLabel: 'Withdraw application',
    },
    MESSAGING: {
      label: 'In conversation with Case Coordination',
      tone: 'border-violet-500/30 bg-violet-500/10 text-violet-900',
      step: 2,
      canApply: false,
      canWithdraw: true,
      actionLabel: 'Withdraw application',
    },
    MEET_SCHEDULED: {
      label: 'Meet and greet scheduled',
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-950',
      step: 3,
      canApply: false,
      canWithdraw: true,
      actionLabel: 'Withdraw application',
    },
    PARENT_PENDING: {
      label: 'Family reviewing fit',
      tone: 'border-orange-500/30 bg-orange-500/10 text-orange-950',
      step: 4,
      canApply: false,
      canWithdraw: true,
      actionLabel: 'Withdraw application',
    },
    APPROVED: {
      label: 'Assigned to this family',
      tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900',
      step: 5,
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Assigned',
    },
    REJECTED: {
      label: 'Not selected for this case',
      tone: 'border-rose-500/30 bg-rose-500/10 text-rose-900',
      step: 0,
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Application closed',
    },
    WITHDRAWN: {
      label: 'Application withdrawn',
      tone: 'border-slate-300/70 bg-slate-100/90 text-slate-700',
      step: 0,
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Withdrawn',
    },
  };

  return (
    states[status] ?? {
      label: 'Application status unavailable',
      tone: 'border-slate-300/70 bg-slate-100/90 text-slate-700',
      step: 0,
      canApply: false,
      canWithdraw: false,
      actionLabel: 'Contact Case Coordination',
    }
  );
}

export function getRadiusSummary(
  listings: JobBoardListing[],
  profile: Pick<JobBoardTravelProfile, 'homeZipCode' | 'maxTravelMiles'>
) {
  const knownCount = listings.filter((listing) => listing.distanceMiles != null).length;
  const unknownCount = listings.length - knownCount;
  const withinRadiusCount = listings.filter((listing) => listing.withinRadius).length;

  if (!profile.homeZipCode) {
    return {
      filterLabel: 'Radius needs home ZIP',
      statValue: '—' as number | string,
      emptyTitle: 'Set a home ZIP to use radius filtering',
      emptyBody:
        'Radius results require your home ZIP. Add it in Travel preferences to calculate estimated commutes.',
    };
  }

  if (knownCount === 0) {
    return {
      filterLabel: 'No radius estimates',
      statValue: '—' as number | string,
      emptyTitle: 'No commute estimates are available',
      emptyBody:
        'These listings do not have enough location data for an estimated commute. Browse all openings and review their borough and schedule.',
    };
  }

  const unknownSuffix =
    unknownCount === 0
      ? ''
      : ` ${unknownCount} listing${unknownCount === 1 ? ' has' : 's have'} no commute estimate.`;

  return {
    filterLabel: `Estimated within ${profile.maxTravelMiles} mi`,
    statValue: withinRadiusCount as number | string,
    emptyTitle: `Nothing estimated within ${profile.maxTravelMiles} mi`,
    emptyBody: `Known commute estimates are beyond your ${profile.maxTravelMiles} mi travel max.${unknownSuffix}`,
  };
}

export function filterJobBoardListings(
  listings: JobBoardListing[],
  filters: {
    searchQuery: string;
    boroughFilter: string;
    viewFilter: JobBoardViewFilter;
  }
): JobBoardListing[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return listings.filter((listing) => {
    const searchable = [
      listing.caseCode,
      listing.borough,
      listing.ageBand,
      listing.scheduleText,
      listing.daysOfWeek,
      listing.languagePref,
      listing.genderPref,
      listing.serviceSetting,
      listing.bcbaDisplayName,
      listing.zipMatchLabel,
      listing.matchReason,
    ];
    const matchesSearch =
      query.length === 0 ||
      searchable.some((value) => value?.toLowerCase().includes(query));
    const matchesBorough =
      filters.boroughFilter === 'ALL' || listing.borough === filters.boroughFilter;
    const matchesView =
      filters.viewFilter === 'ALL' ||
      (filters.viewFilter === 'RECOMMENDED'
        ? listing.recommended
        : filters.viewFilter === 'RADIUS'
          ? listing.withinRadius
          : listing.myApplication != null);

    return matchesSearch && matchesBorough && matchesView;
  });
}

export function getJobBoardEmptyKind(input: {
  openingsCount: number;
  filteredCount: number;
  searchQuery: string;
  boroughFilter: string;
  viewFilter: JobBoardViewFilter;
}): JobBoardEmptyKind | null {
  if (input.openingsCount === 0) return 'NO_OPEN';
  if (input.filteredCount > 0) return null;

  const hasNarrowingFilter =
    input.searchQuery.trim().length > 0 || input.boroughFilter !== 'ALL';
  if (hasNarrowingFilter) return 'FILTERED_OUT';

  if (input.viewFilter === 'RECOMMENDED') return 'NO_RECOMMENDED';
  if (input.viewFilter === 'RADIUS') return 'NO_RADIUS';
  if (input.viewFilter === 'MINE') return 'NO_APPS';
  return 'FILTERED_OUT';
}

export function validateTravelPreferences(
  homeZipCode: string,
  maxTravelMiles: string
):
  | {
      success: true;
      value: { homeZipCode: string; maxTravelMiles: number };
    }
  | { success: false; error: string } {
  const zip = homeZipCode.trim();
  if (!/^\d{5}$/.test(zip)) {
    return { success: false, error: 'Enter an exact 5-digit home ZIP.' };
  }

  const milesText = maxTravelMiles.trim();
  if (!/^\d+$/.test(milesText)) {
    return { success: false, error: 'Travel radius must be a whole number of miles.' };
  }

  const miles = Number(milesText);
  if (!Number.isInteger(miles) || miles < 1 || miles > 100) {
    return { success: false, error: 'Travel radius must be between 1 and 100 miles.' };
  }

  return {
    success: true,
    value: {
      homeZipCode: zip,
      maxTravelMiles: miles,
    },
  };
}
