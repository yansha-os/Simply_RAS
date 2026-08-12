import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_USER_ID = '33333333-3333-4333-8333-333333333333';
const NOTIFICATION_ID = '44444444-4444-4444-8444-444444444444';
const CANDIDATE_ID = '55555555-5555-4555-8555-555555555555';
const FINGERPRINT = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  cookieGet: vi.fn((name: string) => {
    if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  }),
  revalidatePath: vi.fn(),
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/candidateDeviceSession', () => ({
  CANDIDATE_SESSION_COOKIE: 'ras_device_session_token',
  DEVICE_FINGERPRINT_COOKIE: 'device_fingerprint',
  resolveFingerprintValidCandidate: mocks.resolveFingerprintValidCandidate,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

import * as currentNotificationModule from './notifications';
import * as notificationActions from './notificationActions';

type NotificationActions = {
  getNotifications: (spoofedUserId?: string) => Promise<{
    success: boolean;
    notifications: Array<{ id: string }>;
    unreadCount: number;
  }>;
  markNotificationAsRead: (id: string) => Promise<{ success: boolean }>;
  markAllNotificationsAsRead: (spoofedUserId?: string) => Promise<{ success: boolean }>;
};

const currentActions = notificationActions as unknown as NotificationActions;
const originalCrmUrl = process.env.NEXT_PUBLIC_CRM_URL;
const originalHrmUrl = process.env.NEXT_PUBLIC_HRM_URL;

function activeUser(id = USER_ID) {
  return {
    id,
    role: 'RBT',
    isActive: true,
  };
}

function restoreEnv(name: 'NEXT_PUBLIC_CRM_URL' | 'NEXT_PUBLIC_HRM_URL', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_CRM_URL = 'https://crm.example.test/';
  process.env.NEXT_PUBLIC_HRM_URL = 'https://hrm.example.test/';

  mocks.getCurrentUser.mockResolvedValue(activeUser());
  mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);
  mocks.prisma.user.findFirst.mockResolvedValue({ id: USER_ID });
  mocks.prisma.user.findMany.mockResolvedValue([{ id: USER_ID }]);
  mocks.prisma.notification.findFirst.mockResolvedValue(null);
  mocks.prisma.notification.findMany.mockResolvedValue([]);
  mocks.prisma.notification.count.mockResolvedValue(0);
  mocks.prisma.notification.create.mockResolvedValue({ id: NOTIFICATION_ID });
  mocks.prisma.notification.createMany.mockResolvedValue({ count: 1 });
  mocks.prisma.notification.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  restoreEnv('NEXT_PUBLIC_CRM_URL', originalCrmUrl);
  restoreEnv('NEXT_PUBLIC_HRM_URL', originalHrmUrl);
});

describe('HRM notification module boundary', () => {
  it('keeps producers out of every Server Action export module', () => {
    const producerPath = join(
      process.cwd(),
      'apps/hrm/src/app/actions/notifications.ts'
    );
    const actionPath = join(
      process.cwd(),
      'apps/hrm/src/app/actions/notificationActions.ts'
    );
    const producerSource = readFileSync(producerPath, 'utf8');
    const actionSource = existsSync(actionPath) ? readFileSync(actionPath, 'utf8') : '';

    expect(producerSource).not.toMatch(/^\s*['"]use server['"]/m);
    expect(producerSource).toMatch(/import\s+['"]server-only['"]/);
    expect(actionSource).toMatch(/^\s*['"]use server['"]/m);
    expect(actionSource).not.toMatch(
      /export\s+(?:async\s+)?function\s+(?:createNotification|notifyUsers)\b/
    );
  });
});

describe('HRM notification producer security', () => {
  it.each([
    '//evil.example/phish',
    'https://evil.example/phish',
    'https://hrm.example.test.evil.example/phish',
  ])('rejects the untrusted link %s without writing', async (linkUrl) => {
    const result = await currentNotificationModule.createNotification({
      userId: USER_ID,
      title: 'Security test',
      message: 'Do not write this row.',
      linkUrl,
      dedupeHours: 0,
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    '/rbt/payroll?week=current',
    'https://crm.example.test/portal-clinical/notes',
    'https://hrm.example.test/rbt/schedule',
  ])('preserves the trusted application link %s', async (linkUrl) => {
    const result = await currentNotificationModule.createNotification({
      userId: USER_ID,
      title: 'Trusted link',
      message: 'This row is safe.',
      linkUrl,
      dedupeHours: 0,
    });

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, linkUrl }),
    });
  });

  it('does not create a row for an inactive or deleted recipient', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    const result = await currentNotificationModule.createNotification({
      userId: INACTIVE_USER_ID,
      title: 'Inactive recipient',
      message: 'This row must not be written.',
      dedupeHours: 0,
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('rejects fan-out above 100 unique recipients before querying or writing', async () => {
    const userIds = Array.from(
      { length: 101 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    );

    const result = await currentNotificationModule.notifyUsers({
      userIds,
      title: 'Bounded fan-out',
      message: 'This fan-out is too large.',
      type: 'INFO',
      dedupeHours: 0,
    });

    expect(result).toMatchObject({ success: false, notified: 0 });
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('deduplicates recipient IDs and drops inactive or deleted recipients', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: USER_ID },
      { id: OTHER_USER_ID },
    ]);

    const result = await currentNotificationModule.notifyUsers({
      userIds: [USER_ID, USER_ID, OTHER_USER_ID, INACTIVE_USER_ID],
      title: 'Filtered fan-out',
      message: 'Only active unique users receive this.',
      type: 'INFO',
      dedupeHours: 0,
    });

    expect(result).toMatchObject({ success: true, notified: 2 });
    expect(mocks.prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: USER_ID }),
        expect.objectContaining({ userId: OTHER_USER_ID }),
      ],
    });
  });
});

describe('HRM notification recipient actions', () => {
  it('rejects an inactive session before list, count, read, or mark-all access', async () => {
    mocks.getCurrentUser.mockResolvedValue({
      ...activeUser(INACTIVE_USER_ID),
      isActive: false,
    });

    const list = await currentActions.getNotifications(OTHER_USER_ID);
    const read = await currentActions.markNotificationAsRead(NOTIFICATION_ID);
    const markAll = await currentActions.markAllNotificationsAsRead(OTHER_USER_ID);

    expect(list).toMatchObject({ success: false, notifications: [], unreadCount: 0 });
    expect(read).toMatchObject({ success: false });
    expect(markAll).toMatchObject({ success: false });
    expect(mocks.prisma.notification.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.count).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('ignores a spoofed recipient and scopes list/count to the active session', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([{ id: NOTIFICATION_ID }]);
    mocks.prisma.notification.count.mockResolvedValue(1);

    const result = await currentActions.getNotifications(OTHER_USER_ID);

    expect(result).toMatchObject({ success: true, unreadCount: 1 });
    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    expect(mocks.prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, isRead: false },
    });
  });

  it('acknowledges only a notification owned by the active session recipient', async () => {
    const result = await currentActions.markNotificationAsRead(NOTIFICATION_ID);

    expect(result).toMatchObject({ success: true });
    expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: NOTIFICATION_ID, userId: USER_ID },
      data: { isRead: true },
    });
  });

  it('resolves a hired candidate only through the fingerprint-valid device session', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.resolveFingerprintValidCandidate.mockResolvedValue({
      id: CANDIDATE_ID,
      userId: USER_ID,
      stage: 'HIRED',
    });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: USER_ID });

    const result = await currentActions.getNotifications(OTHER_USER_ID);

    expect(result).toMatchObject({ success: true });
    expect(mocks.resolveFingerprintValidCandidate).toHaveBeenCalledWith(
      CANDIDATE_ID,
      FINGERPRINT
    );
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: USER_ID, isActive: true, role: 'RBT' },
      select: { id: true },
    });
    expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
  });

  it('does not trust raw candidate cookies when device-session validation fails', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);

    const result = await currentActions.getNotifications(USER_ID);

    expect(result).toMatchObject({ success: false, notifications: [], unreadCount: 0 });
    expect(mocks.prisma.notification.findMany).not.toHaveBeenCalled();
  });
});
