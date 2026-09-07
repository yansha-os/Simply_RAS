import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dev tools deployment fence', () => {
  it('allows explicit dev tools only in a local non-production environment', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    vi.stubEnv('RENDER', '');
    vi.stubEnv('RENDER_SERVICE_ID', '');
    vi.stubEnv('RENDER_EXTERNAL_HOSTNAME', '');

    const gate = await import('../devToolsGate');

    expect(gate.isDevToolsEnabled()).toBe(true);
  });

  it('fails module initialization when dev tools are enabled on Render', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEV_TOOLS', 'true');
    vi.stubEnv('RENDER', 'true');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(import('../devToolsGate')).rejects.toThrow(/Render deployment/i);
    } finally {
      consoleError.mockRestore();
    }
  });
});
