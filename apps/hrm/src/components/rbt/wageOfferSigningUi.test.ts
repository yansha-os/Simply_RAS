import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(
    process.cwd(),
    'apps/hrm/src/components/rbt/WageOfferApplicantCard.tsx'
  ),
  'utf8'
);

describe('applicant wage signing UI boundary', () => {
  it('submits the exact rendered notice version and content hash', () => {
    expect(source).toMatch(/noticeVersion:\s*offer\.version/);
    expect(source).toMatch(
      /noticeContentSha256:\s*offer\.noticeContentSha256/
    );
  });

  it('does not auto-hire or claim official hire from the wage signature UI', () => {
    expect(source).toMatch(/Head HR must complete final hire review/);
    expect(source).not.toMatch(/officially hired as an RBT/i);
    expect(source).not.toMatch(/bypassReadinessCheck/);
  });
});
