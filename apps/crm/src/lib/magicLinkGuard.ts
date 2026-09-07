import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { requireStaff, type SessionUser } from '@/lib/auth-guard';

/**
 * Parent magic-link gate (readiness Blocker 0a + gap 7).
 *
 * A parent-facing server action may only touch an IntakePacket when the caller
 * proves possession of BOTH:
 *   1. a live magic link (token present, not revoked, not expired), and
 *   2. the device fingerprint the link was bound to on first open
 *      (httpOnly `device_fingerprint` cookie set by middleware).
 *
 * Staff sessions bypass the fingerprint requirement via requireStaffOrParent.
 */

const MAGIC_LINK_TTL_DAYS = 30;

export function newMagicLinkExpiry(): Date {
  return new Date(Date.now() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

type PacketAuthFields = {
  magicLinkToken: string | null;
  magicLinkExpiresAt: Date | null;
  magicLinkRevokedAt: Date | null;
  deviceFingerprint: string | null;
};

/** Link liveness only (no fingerprint) — also used by the magic-link page. */
export function magicLinkStatus(packet: PacketAuthFields): { ok: true } | { ok: false; error: string } {
  if (!packet?.magicLinkToken) {
    return { ok: false, error: 'This link is no longer active. Please contact the clinic for a new link.' };
  }
  if (packet.magicLinkRevokedAt) {
    return { ok: false, error: 'This link has been revoked. Please contact the clinic for a new link.' };
  }
  // NULL expiry = legacy link issued before expiry tracking; a fresh window is
  // stamped whenever staff generate/reset a link.
  if (packet.magicLinkExpiresAt) {
    const expiryTime =
      packet.magicLinkExpiresAt instanceof Date
        ? packet.magicLinkExpiresAt.getTime()
        : new Date(packet.magicLinkExpiresAt).getTime();
    if (!isNaN(expiryTime) && expiryTime < Date.now()) {
      return { ok: false, error: 'This link has expired. Please contact the clinic for a new link.' };
    }
  }
  return { ok: true };
}

export type ParentPacketGate =
  | { ok: true; packetId: string; clientId: string }
  | { ok: false; error: string };

type PacketRef = { packetId?: string; clientId?: string; token?: string };

async function findPacket(ref: PacketRef) {
  const select = {
    id: true,
    clientId: true,
    magicLinkToken: true,
    magicLinkExpiresAt: true,
    magicLinkRevokedAt: true,
    deviceFingerprint: true,
  } as const;
  if (ref.packetId) return prisma.intakePacket.findUnique({ where: { id: ref.packetId }, select });
  if (ref.token) return prisma.intakePacket.findUnique({ where: { magicLinkToken: ref.token }, select });
  if (ref.clientId) return prisma.intakePacket.findUnique({ where: { clientId: ref.clientId }, select });
  return null;
}

/**
 * Parent proof: live link + bound device fingerprint. The magic-link page
 * binds the fingerprint on first open, so any legitimate action call already
 * has a bound packet + matching cookie.
 */
export async function requireParentPacketAccess(ref: PacketRef): Promise<ParentPacketGate> {
  try {
    const packet = await findPacket(ref);
    if (!packet) return { ok: false, error: 'Intake packet not found.' };

    const live = magicLinkStatus(packet);
    if (!live.ok) return live;

    const cookieStore = await cookies();
    const fingerprint = cookieStore.get('device_fingerprint')?.value;
    if (!fingerprint || !packet.deviceFingerprint || packet.deviceFingerprint !== fingerprint) {
      return {
        ok: false,
        error: 'This portal is locked to the device that first opened the link. Please use your original device or request a new link.',
      };
    }

    return { ok: true, packetId: packet.id, clientId: packet.clientId };
  } catch (error) {
    console.error(
      'requireParentPacketAccess failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { ok: false, error: 'Could not verify portal access.' };
  }
}

export type StaffOrParentGate =
  | { ok: true; via: 'staff'; user: SessionUser; packetId?: string; clientId?: string }
  | { ok: true; via: 'parent'; packetId: string; clientId: string }
  | { ok: false; error: string };

/**
 * For actions shared by staff UIs and the parent magic-link portal
 * (client messages, schedule prefs, treatment-plan sign).
 */
export async function requireStaffOrParent(ref: PacketRef): Promise<StaffOrParentGate> {
  const staff = await requireStaff();
  if (staff.ok) return { ok: true, via: 'staff', user: staff.user };

  const parent = await requireParentPacketAccess(ref);
  if (parent.ok) {
    return { ok: true, via: 'parent', packetId: parent.packetId, clientId: parent.clientId };
  }
  return { ok: false, error: parent.error };
}
