'use server';

import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import {
  calculateCredentialRosterScorecard,
  evaluateCredentialItem,
  verifyPayerClearance,
  type CredentialRosterScorecard,
  type StaffPayerClearance,
} from '@/lib/staffCredentialWatchdog';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAgencyCredentialScorecard(): Promise<{
  success: boolean;
  scorecard?: CredentialRosterScorecard;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'HR', 'HEAD_HR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const staffUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['BCBA', 'RBT', 'CLINICAL_DIRECTOR'] },
      },
      include: {
        credentials: true,
      },
    });

    const now = new Date();
    const staffList = staffUsers.map((u) => {
      const credentials = u.credentials.map((c) =>
        evaluateCredentialItem(
          {
            id: c.id,
            userId: c.userId,
            credentialType: c.credentialType,
            credentialNumber: c.credentialNumber,
            payerName: c.payerName,
            isCredentialed: c.isCredentialed,
            expirationDate: c.expirationDate,
          },
          now
        )
      );

      return {
        userId: u.id,
        staffName: `${u.firstName} ${u.lastName}`,
        role: String(u.role),
        credentials,
      };
    });

    const scorecard = calculateCredentialRosterScorecard(staffList);

    return {
      success: true,
      scorecard,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve credential scorecard.',
    };
  }
}

export async function checkStaffPayerClearance(params: {
  userId: string;
  payerName: string;
}): Promise<{
  success: boolean;
  clearance?: StaffPayerClearance;
  error?: string;
}> {
  try {
    const gate = await requireStaff([
      'CEO',
      'CLINICAL_DIRECTOR',
      'HR',
      'HEAD_HR',
      'OPS_DIRECTOR',
      'BILLING',
    ]);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const payerName = params.payerName.trim();
    if (!UUID_RE.test(params.userId) || !payerName || payerName.length > 120) {
      return { success: false, error: 'Valid staff and payer values are required.' };
    }

    const user = await prisma.user.findFirst({
      where: {
        id: params.userId,
        isActive: true,
        role: { in: ['BCBA', 'RBT', 'CLINICAL_DIRECTOR'] },
      },
      include: { credentials: true },
    });

    if (!user) {
      return { success: false, error: 'Staff user not found.' };
    }

    const now = new Date();
    const credentials = user.credentials.map((c) =>
      evaluateCredentialItem(
        {
          id: c.id,
          userId: c.userId,
          credentialType: c.credentialType,
          credentialNumber: c.credentialNumber,
          payerName: c.payerName,
          isCredentialed: c.isCredentialed,
          expirationDate: c.expirationDate,
        },
        now
      )
    );

    const clearance = verifyPayerClearance({
      userId: user.id,
      staffName: `${user.firstName} ${user.lastName}`,
      role: String(user.role),
      payerName,
      credentials,
    });

    return {
      success: true,
      clearance,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify payer clearance.',
    };
  }
}
