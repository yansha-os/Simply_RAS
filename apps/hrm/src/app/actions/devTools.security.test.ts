import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prismaAccess = vi.fn();
  const prisma = new Proxy(
    {},
    {
      get(_target, property) {
        prismaAccess(property);
        return undefined;
      },
    }
  );

  return { prisma, prismaAccess };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

import { devSeedConnectedProductDemo } from './devTools';

describe('connected-product demo assignment seeder fence', () => {
  it('returns before its first Prisma access when dev tools are disabled', async () => {
    const result = await devSeedConnectedProductDemo({
      mode: 'ACTIVE',
      withSession: true,
    });

    expect(result).toEqual({ success: false, error: 'Dev tools disabled' });
    expect(mocks.prismaAccess).not.toHaveBeenCalled();
  });
});
