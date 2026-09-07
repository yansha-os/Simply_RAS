import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const REVIEWED_PUBLIC_DATABASE_ACTIONS = new Set([
  'apps/crm/src/app/login/actions.ts',
  'apps/hrm/src/app/login/actions.ts',
  'apps/hrm/src/app/actions/publicRbt.ts',
  'apps/hrm/src/app/actions/applicantSessionActions.ts',
]);

const AUTHORIZATION_MARKERS = [
  'requireStaff(',
  'requirePersistedStaff(',
  'requireClientAccess(',
  'requireParentPacketAccess(',
  'requireStaffOrParent(',
  'requireRole(',
  'resolveActingRbt',
  'resolveApplicant',
  'requireNotificationRecipient(',
  'runAuthorized',
  'isDevToolsEnabled(',
] as const;

function rgFiles(args: string[]): string {
  try {
    return execFileSync('rg', args, { cwd: ROOT, encoding: 'utf8' });
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number(error.status)
        : null;
    if (status === 1) return '';
    throw error;
  }
}

describe('Server Action authorization inventory', () => {
  it('requires every database-backed action module to declare an authorization boundary', () => {
    const output = rgFiles([
      '-l',
      "^['\"]use server['\"]",
      'apps/crm/src',
      'apps/hrm/src',
      '--glob',
      '*.ts',
    ]);
    const violations: string[] = [];

    for (const rawPath of output.split(/\r?\n/).filter(Boolean)) {
      const normalized = relative(ROOT, resolve(ROOT, rawPath)).replaceAll('\\', '/');
      if (normalized.endsWith('.test.ts')) continue;
      const source = readFileSync(resolve(ROOT, rawPath), 'utf8');
      if (!/\bprisma\./.test(source)) continue;
      if (REVIEWED_PUBLIC_DATABASE_ACTIONS.has(normalized)) continue;
      if (!AUTHORIZATION_MARKERS.some((marker) => source.includes(marker))) {
        violations.push(normalized);
      }
    }

    expect(violations).toEqual([]);
  });

  it('has no duplicate legacy RBT profile-sync action', () => {
    const tracked = rgFiles([
      '-l',
      'syncRbtProfileToCrm',
      'apps/crm/src',
      'apps/hrm/src',
      '--glob',
      '*.ts',
      '--glob',
      '*.tsx',
    ])
      .split(/\r?\n/)
      .filter((path) => path && !path.endsWith('.test.ts'));
    expect(tracked).toEqual([]);
  });
});
