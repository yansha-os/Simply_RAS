import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const actionSource = readFileSync(
  join(process.cwd(), 'apps/hrm/src/app/actions/atsActions.ts'),
  'utf8'
);
const viewSource = readFileSync(
  join(process.cwd(), 'apps/hrm/src/components/hrm/RbtManagerView.tsx'),
  'utf8'
);

describe('hired candidate credential language', () => {
  it('marks candidate-linked profiles as device-session-only', () => {
    expect(actionSource).toMatch(/DEVICE_SESSION_ONLY/);
    expect(viewSource).toMatch(/Device session only/);
  });

  it('does not label internal profile activation as a provisioned RBT account', () => {
    expect(viewSource).not.toMatch(/label="Active RBT accounts"/);
    expect(viewSource).toMatch(/does not confirm Supabase Auth credentials/i);
  });
});
