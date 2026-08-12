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

  it('describes signing as pending staff final hire rather than login-ready auto-hire', () => {
    expect(source).toMatch(/Head HR.*final hire/i);
    expect(source).not.toMatch(/Welcome aboard — you are now an official RBT/);
    expect(source).not.toMatch(/promoteClientRoleToRbt/);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*['"]\/rbt\/schedule/);
  });
});
