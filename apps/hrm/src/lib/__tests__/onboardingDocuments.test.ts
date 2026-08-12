import { describe, expect, it } from 'vitest';

import {
  HARASSMENT_QUIZ,
  HARASSMENT_QUIZ_PASS_PCT,
  ONBOARDING_DOCS,
  ONBOARDING_PDF_BASE,
  ONBOARDING_TOTAL_STEPS,
  buildDefaultLs54Payload,
  getOnboardingDoc,
  pdfUrl,
} from '../onboardingDocuments';

describe('ONBOARDING_DOCS integrity', () => {
  it('has exactly ONBOARDING_TOTAL_STEPS contiguous steps starting at 1', () => {
    expect(ONBOARDING_DOCS).toHaveLength(ONBOARDING_TOTAL_STEPS);
    const steps = ONBOARDING_DOCS.map((d) => d.step).sort((a, b) => a - b);
    expect(steps).toEqual(Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => i + 1));
  });

  it('has unique, non-empty keys and titles on every step', () => {
    const keys = ONBOARDING_DOCS.map((d) => d.key);
    expect(new Set(keys).size).toBe(ONBOARDING_DOCS.length);
    for (const d of ONBOARDING_DOCS) {
      expect(d.key.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.legalCite.length).toBeGreaterThan(0);
    }
  });

  it('gives every UPLOAD step an accept filter and label', () => {
    for (const d of ONBOARDING_DOCS.filter((x) => x.kind === 'UPLOAD')) {
      expect(d.uploadAccept, `${d.key} missing uploadAccept`).toBeTruthy();
      expect(d.uploadLabel, `${d.key} missing uploadLabel`).toBeTruthy();
    }
  });
});

describe('getOnboardingDoc / pdfUrl', () => {
  it('returns the matching step and falls back to step 1 for out-of-range input', () => {
    expect(getOnboardingDoc(4).key).toBe('hipaa-confidentiality');
    expect(getOnboardingDoc(0)).toBe(ONBOARDING_DOCS[0]);
    expect(getOnboardingDoc(999)).toBe(ONBOARDING_DOCS[0]);
  });

  it('builds public PDF urls under the onboarding-docs base', () => {
    expect(pdfUrl('nda.pdf')).toBe(`${ONBOARDING_PDF_BASE}/nda.pdf`);
  });
});

describe('HARASSMENT_QUIZ integrity', () => {
  it('keeps every correctIndex within its options and unique question ids', () => {
    const ids = HARASSMENT_QUIZ.map((q) => q.id);
    expect(new Set(ids).size).toBe(HARASSMENT_QUIZ.length);
    for (const q of HARASSMENT_QUIZ) {
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the pass bar achievable as a whole-question count', () => {
    const needed = Math.ceil((HARASSMENT_QUIZ_PASS_PCT / 100) * HARASSMENT_QUIZ.length);
    expect(needed).toBeLessThanOrEqual(HARASSMENT_QUIZ.length);
    expect(needed).toBeGreaterThan(0);
  });
});

describe('buildDefaultLs54Payload', () => {
  it('fills employer defaults and threads employee/preparer names through', () => {
    const p = buildDefaultLs54Payload('Rita RBT', 'Hank HR');
    expect(p.employeeName).toBe('Rita RBT');
    expect(p.preparerName).toBe('Hank HR');
    expect(p.employerName).toBe('Rise & Shine ABA LLC');
    expect(p.noticeGiven).toBe('AT_HIRING');
    expect(p.payFrequency).toBe('BIWEEKLY');
    expect(p.allowancesNone).toBe(true);
    expect(p.tipsPerHour).toBeNull();
    expect(p.rateOfPay).toBe(0);
  });
});
