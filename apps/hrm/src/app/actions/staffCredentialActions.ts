'use server';

import type { Role } from '@repo/db';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import { writeAuditLog } from '@/lib/auditLog';
import { clinicDateKey } from '@/lib/clinicTimezone';

const CREDENTIAL_ADMIN_ROLES: readonly Role[] = ['HR', 'HEAD_HR', 'CEO'];
const CREDENTIALS_PATH = '/hr-dashboard/credentials';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

type CredentialFields = {
  credentialType: string;
  expirationDate: string | null;
};

type CreateCredentialInput = CredentialFields & {
  userId: string;
};

type UpdateCredentialInput = CredentialFields & {
  id: string;
};

function validateId(id: string, label: string) {
  return UUID_RE.test(id) ? null : `${label} is invalid.`;
}

function parseCredentialFields(input: CredentialFields):
  | { ok: true; credentialType: string; expirationDate: Date | null }
  | { ok: false; error: string } {
  const credentialType = input.credentialType.trim();
  if (!credentialType) {
    return { ok: false, error: 'Credential type is required.' };
  }
  if (credentialType.length > 80) {
    return { ok: false, error: 'Credential type must be 80 characters or fewer.' };
  }

  const expirationInput = input.expirationDate?.trim() ?? '';
  if (!expirationInput) {
    return { ok: true, credentialType, expirationDate: null };
  }
  if (!DATE_ONLY_RE.test(expirationInput)) {
    return { ok: false, error: 'Expiration date must use YYYY-MM-DD.' };
  }

  const expirationDate = new Date(`${expirationInput}T00:00:00.000Z`);
  if (
    Number.isNaN(expirationDate.getTime()) ||
    expirationDate.toISOString().slice(0, 10) !== expirationInput
  ) {
    return { ok: false, error: 'Expiration date is invalid.' };
  }

  return { ok: true, credentialType, expirationDate };
}

function toDateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function listActiveStaffCredentials() {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    // User.credentials is one-to-many (StaffCredential[]) in schema.prisma.
    const staff = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        credentials: {
          orderBy: [{ credentialType: 'asc' }, { expirationDate: 'desc' }],
          select: {
            id: true,
            userId: true,
            credentialType: true,
            credentialNumber: true,
            payerName: true,
            isCredentialed: true,
            expirationDate: true,
            updatedAt: true,
          },
        },
      },
    });

    return {
      success: true as const,
      asOfDate: clinicDateKey(new Date()),
      data: staff.map((user) => ({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: String(user.role),
        credentials: user.credentials.map((credential) => ({
          ...credential,
          expirationDate: toDateOnly(credential.expirationDate),
          updatedAt: credential.updatedAt.toISOString(),
        })),
      })),
    };
  } catch (error) {
    console.error(
      'listActiveStaffCredentials failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false as const, error: 'Could not load staff credentials.' };
  }
}

export async function createStaffCredential(input: CreateCredentialInput) {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const idError = validateId(input.userId, 'Staff member');
    if (idError) return { success: false as const, error: idError };

    const fields = parseCredentialFields(input);
    if (!fields.ok) return { success: false as const, error: fields.error };

    const activeStaff = await prisma.user.findFirst({
      where: { id: input.userId, isActive: true },
      select: { id: true },
    });
    if (!activeStaff) {
      return { success: false as const, error: 'Active staff member was not found.' };
    }

    const credential = await prisma.staffCredential.create({
      data: {
        userId: activeStaff.id,
        credentialType: fields.credentialType,
        expirationDate: fields.expirationDate,
        isCredentialed: true,
      },
      select: { id: true, userId: true },
    });

    await writeAuditLog({
      actorUserId: gate.user.id,
      action: 'EDIT',
      entityType: 'STAFF_CREDENTIAL',
      entityId: credential.id,
      meta: { targetUserId: credential.userId, event: 'CREATED' },
    });
    revalidatePath(CREDENTIALS_PATH);

    return { success: true as const };
  } catch (error) {
    console.error(
      'createStaffCredential failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false as const, error: 'Could not add the credential.' };
  }
}

export async function updateStaffCredential(input: UpdateCredentialInput) {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const idError = validateId(input.id, 'Credential');
    if (idError) return { success: false as const, error: idError };

    const fields = parseCredentialFields(input);
    if (!fields.ok) return { success: false as const, error: fields.error };

    const existing = await prisma.staffCredential.findUnique({
      where: { id: input.id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      return { success: false as const, error: 'Credential record was not found.' };
    }

    await prisma.staffCredential.update({
      where: { id: existing.id },
      data: {
        credentialType: fields.credentialType,
        expirationDate: fields.expirationDate,
      },
    });

    await writeAuditLog({
      actorUserId: gate.user.id,
      action: 'EDIT',
      entityType: 'STAFF_CREDENTIAL',
      entityId: existing.id,
      meta: { targetUserId: existing.userId },
    });
    revalidatePath(CREDENTIALS_PATH);

    return { success: true as const };
  } catch (error) {
    console.error(
      'updateStaffCredential failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false as const, error: 'Could not update the credential.' };
  }
}

export async function revokeStaffCredential(id: string) {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const idError = validateId(id, 'Credential');
    if (idError) return { success: false as const, error: idError };

    const existing = await prisma.staffCredential.findUnique({
      where: { id },
      select: { id: true, userId: true, isCredentialed: true },
    });
    if (!existing) {
      return { success: false as const, error: 'Credential record was not found.' };
    }
    if (!existing.isCredentialed) {
      return { success: true as const };
    }

    await prisma.staffCredential.update({
      where: { id: existing.id },
      data: { isCredentialed: false },
    });

    await writeAuditLog({
      actorUserId: gate.user.id,
      action: 'EDIT',
      entityType: 'STAFF_CREDENTIAL',
      entityId: existing.id,
      meta: { targetUserId: existing.userId, event: 'REVOKED' },
    });
    revalidatePath(CREDENTIALS_PATH);

    return { success: true as const };
  } catch (error) {
    console.error(
      'revokeStaffCredential failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false as const, error: 'Could not revoke the credential.' };
  }
}

export async function deleteStaffCredential(id: string) {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const idError = validateId(id, 'Credential');
    if (idError) return { success: false as const, error: idError };

    const existing = await prisma.staffCredential.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      return { success: false as const, error: 'Credential record was not found.' };
    }

    await prisma.staffCredential.delete({ where: { id: existing.id } });
    await writeAuditLog({
      actorUserId: gate.user.id,
      action: 'DELETE',
      entityType: 'STAFF_CREDENTIAL',
      entityId: existing.id,
      meta: { targetUserId: existing.userId },
    });
    revalidatePath(CREDENTIALS_PATH);

    return { success: true as const };
  } catch (error) {
    console.error(
      'deleteStaffCredential failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false as const, error: 'Could not delete the credential.' };
  }
}
