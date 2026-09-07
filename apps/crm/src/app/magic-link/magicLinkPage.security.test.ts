import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('parent magic-link page boundary', () => {
  const source = readFileSync(
    join(process.cwd(), 'apps/crm/src/app/magic-link/[id]/page.tsx'),
    'utf8'
  );

  it('looks up portals only by the unguessable magic-link token', () => {
    expect(source).toContain('where: { magicLinkToken: params.id }');
    expect(source).not.toMatch(/where:\s*\{\s*OR:\s*\[\s*\{ clientId: params\.id \}/);
    expect(source).not.toContain('where: { id: params.id }');
    expect(source).not.toContain('clientId: client.id');
  });

  it('claims the first device atomically and fails closed without a fingerprint', () => {
    expect(source).toContain('prisma.intakePacket.updateMany');
    expect(source).toContain('deviceFingerprint: null');
    expect(source).toContain('magicLinkRevokedAt: null');
    expect(source).toMatch(/if \(!currentFingerprint \|\| !\/\^\[0-9a-f-\]/);
  });

  it('does not contain the removed UUID compatibility fallback', () => {
    expect(source).not.toMatch(/\^\[0-9a-fA-F-\]\{36\}\$/);
    expect(source).not.toContain('intakePacket.create');
    expect(source).not.toContain('client.update');
  });
});
