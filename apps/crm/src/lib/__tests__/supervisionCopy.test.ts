import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');

const auditedSurfacePaths = [
  'apps/crm/src/components/client-profile/ClientProfileTabs.tsx',
  'apps/crm/src/components/magic-link/ClientPortalView.tsx',
  'apps/crm/src/components/magic-link/Form02Consent.tsx',
  'apps/crm/src/components/portal-billing/BillingPaQueue.tsx',
  'apps/crm/src/components/public-rbt/RbtPublicLanding.tsx',
  'apps/crm/src/lib/pdf/treatmentPlanReportModel.ts',
  'apps/hrm/src/components/public-rbt/RbtPublicLanding.tsx',
  'apps/hrm/src/components/rbt/RbtTasksView.tsx',
  'apps/hrm/src/lib/onboardingDocuments.ts',
  'apps/hrm/src/lib/pdf/treatmentPlanReportModel.ts',
] as const;

const surfaceSource = Object.fromEntries(
  auditedSurfacePaths.map((surfacePath) => [
    surfacePath,
    readFileSync(path.join(repoRoot, surfacePath), 'utf8'),
  ])
) as Record<(typeof auditedSurfacePaths)[number], string>;

function compact(source: string) {
  return source.replace(/\s+/g, ' ');
}

describe('supervision and CPT 97155 surface copy', () => {
  it('does not present unsupported supervision metrics or generic 97155 supervision labels', () => {
    const forbiddenClaims = [
      /10\s*[-–—]\s*20%\s+SUPERVISION SCORE/i,
      /100%\s+Compliant/i,
      /98\.4%/,
      /3\.2 Days/i,
      /Top Practitioner/i,
      /(?:\b97155\b|hours97155).{0,180}\b(?:BCBA\s+)?Supervision\b/i,
      /\b(?:BCBA\s+)?Supervision\b.{0,180}(?:\b97155\b|hours97155)/i,
      /5%\s+of\s+monthly\s+direct\s+service\s+hours/i,
      /50%\s+of\s+supervision/i,
      /Supervision logs must be co-signed in HRM within 7 days/i,
      /Required by BACB RBT Handbook/i,
      /may not deliver client services during any period without an active supervision contract/i,
      /expert BCBA clinical supervision/i,
      /\bBCBA Supervision\b/i,
      /ongoing supervision/i,
      /on every case with regular check-ins/i,
      /tuition assistance and supervision hours/i,
      /We provide full guidance and study support throughout the certification process/i,
      /1-on-1 mentorship from certified BCBAs/i,
      /1-on-1 BCBA Clinical Mentorship/i,
      /Fast-Track BACB Matching/i,
      /BACB Certification Verification/i,
      /BACB Approved Clinical Standards/i,
      /Already certified RBTs are fast-tracked into client matching/i,
      /BACB RBT supervision requirements/i,
      /48\+.{0,120}RBTs Active in NYC/i,
      /95%.{0,120}Candidate Satisfaction/i,
      /5★.{0,120}RBT Team Rating/i,
    ];

    for (const surfacePath of auditedSurfacePaths) {
      const source = compact(surfaceSource[surfacePath]);
      for (const claim of forbiddenClaims) {
        expect(source, `${surfacePath} contains ${claim}`).not.toMatch(claim);
      }
    }
  });

  it('retains explicit evidence-state and protocol-modification language', () => {
    const profile = surfaceSource[
      'apps/crm/src/components/client-profile/ClientProfileTabs.tsx'
    ];
    expect(profile).toContain('SUPERVISION ASSESSMENT');
    expect(profile).toContain('Policy not configured');
    expect(profile).toContain('Evidence unavailable');

    expect(
      surfaceSource['apps/crm/src/components/magic-link/ClientPortalView.tsx']
    ).toContain('Requested 97155 protocol-modification service hours (qualified clinician)');

    expect(
      surfaceSource['apps/crm/src/components/magic-link/Form02Consent.tsx']
    ).toContain('adaptive behavior treatment with protocol modification by a qualified clinician');

    expect(
      surfaceSource['apps/crm/src/components/portal-billing/BillingPaQueue.tsx']
    ).toContain("label: 'Protocol mod · qualified clinician'");

    for (const reportModelPath of [
      'apps/crm/src/lib/pdf/treatmentPlanReportModel.ts',
      'apps/hrm/src/lib/pdf/treatmentPlanReportModel.ts',
    ] as const) {
      expect(surfaceSource[reportModelPath]).toContain(
        'Planned Adaptive Behavior Treatment with Protocol Modification (Qualified Clinician)'
      );
    }

    const rbtTasks =
      surfaceSource['apps/hrm/src/components/rbt/RbtTasksView.tsx'];
    expect(rbtTasks).toContain(
      'Confirm current supervision plan with your qualified supervisor/HR.'
    );
    expect(rbtTasks).toContain(
      'This portal does not calculate or certify supervision compliance.'
    );
    expect(rbtTasks).toContain(
      'Agency policy, payer contracts, and state rules are separate'
    );
  });

  it('keeps mirrored public and onboarding supervision copy neutral', () => {
    const publicLandingPaths = [
      'apps/crm/src/components/public-rbt/RbtPublicLanding.tsx',
      'apps/hrm/src/components/public-rbt/RbtPublicLanding.tsx',
    ] as const;
    const requiredPublicCopy = [
      'Supervision requirements depend on current certification standards, the assigned qualified supervisor, agency policy, payer contract, and jurisdiction.',
      'Certification, agency, payer, and jurisdictional requirements remain separate.',
      'Confirm your current supervision plan with HR and your qualified supervisor.',
      'This site does not calculate or verify supervision compliance.',
      'Certification documents, if submitted, are reviewed by staff before assignment decisions.',
      'BACB Certification Resources',
    ];

    expect(surfaceSource[publicLandingPaths[0]]).toBe(
      surfaceSource[publicLandingPaths[1]]
    );

    for (const landingPath of publicLandingPaths) {
      const source = compact(surfaceSource[landingPath]);
      for (const copy of requiredPublicCopy) {
        expect(source, `${landingPath} is missing "${copy}"`).toContain(copy);
      }
      expect(source).not.toMatch(/\b97155\b/);
      expect(source).not.toMatch(/\d+(?:\.\d+)?%/);
      expect(source).not.toMatch(
        /\b(?:provisions?|creates?)\b.{0,60}\b(?:Supabase\s+)?Auth account\b/i
      );
    }

    expect(
      surfaceSource['apps/hrm/src/lib/onboardingDocuments.ts']
    ).toContain(
      "legalCite: 'Supervision sources remain separate: current certification standards, assigned qualified supervisor, agency policy, payer contract, and jurisdiction; confirm the current plan with HR and the qualified supervisor'"
    );
  });
});
