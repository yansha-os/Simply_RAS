import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('address autocomplete privacy boundary', () => {
  it('fails closed without accepting or forwarding patient address data', async () => {
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Address lookup is unavailable. Enter the address manually.',
    });
  });
});
