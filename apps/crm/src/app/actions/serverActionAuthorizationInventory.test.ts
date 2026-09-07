import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
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

function sourceFiles(extensions: ReadonlySet<string>): string[] {
  const pending = [resolve(ROOT, 'apps/crm/src'), resolve(ROOT, 'apps/hrm/src')];
  const files: string[] = [];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) break;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  return files.sort();
}

describe('Server Action authorization inventory', () => {
  it('requires every database-backed action module to declare an authorization boundary', () => {
    const violations: string[] = [];

    for (const path of sourceFiles(new Set(['.ts']))) {
      const normalized = relative(ROOT, path).replaceAll('\\', '/');
      if (normalized.endsWith('.test.ts')) continue;
      const source = readFileSync(path, 'utf8');
      if (!/^['"]use server['"]/.test(source)) continue;
      if (!/\bprisma\./.test(source)) continue;
      if (REVIEWED_PUBLIC_DATABASE_ACTIONS.has(normalized)) continue;
      if (!AUTHORIZATION_MARKERS.some((marker) => source.includes(marker))) {
        violations.push(normalized);
      }
    }

    expect(violations).toEqual([]);
  });

  it('has no duplicate legacy RBT profile-sync action', () => {
    const tracked = sourceFiles(new Set(['.ts', '.tsx']))
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('syncRbtProfileToCrm'))
      .map((path) => relative(ROOT, path).replaceAll('\\', '/'));
    expect(tracked).toEqual([]);
  });
});
