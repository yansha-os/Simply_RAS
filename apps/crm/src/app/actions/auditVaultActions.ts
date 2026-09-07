'use server';

import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import {
  buildAuditCsvExport,
  sanitizeAuditMetadata,
  verifyAuditHashChain,
  type AuditVaultFilters,
  type AuditVaultRecord,
  type HashChainVerificationResult,
} from '@/lib/auditVaultInspector';

export async function queryAuditVault(filters: AuditVaultFilters = {}): Promise<{
  success: boolean;
  records?: AuditVaultRecord[];
  totalCount?: number;
  hashVerification?: HashChainVerificationResult;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const where: Record<string, unknown> = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.resourceId) where.resourceId = filters.resourceId;

    if (filters.startDate || filters.endDate) {
      where.timestamp = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    const limit = Math.min(100, Math.max(1, filters.limit || 50));
    const offset = Math.max(0, filters.offset || 0);

    const [rawLogs, totalCount] = await Promise.all([
      prisma.auditLogVault.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLogVault.count({ where }),
    ]);

    // Fetch user details for the logs
    const userIds = Array.from(new Set(rawLogs.map((l) => l.userId).filter(Boolean))) as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const records: AuditVaultRecord[] = rawLogs.map((l) => {
      const user = l.userId ? userMap.get(l.userId) : null;
      return {
        id: l.id,
        userId: l.userId,
        userName: user ? `${user.firstName} ${user.lastName}` : null,
        userEmail: user ? user.email : null,
        action: l.action,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        ipAddress: l.ipAddress,
        metadata: sanitizeAuditMetadata(l.metadata),
        timestamp: l.timestamp.toISOString(),
      };
    });

    const hashVerification = verifyAuditHashChain(records);

    return {
      success: true,
      records,
      totalCount,
      hashVerification,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to query Audit Log Vault.',
    };
  }
}

export async function exportAuditVaultReport(filters: AuditVaultFilters = {}): Promise<{
  success: boolean;
  csvData?: string;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const result = await queryAuditVault({ ...filters, limit: 1000, offset: 0 });
    if (!result.success || !result.records) {
      return { success: false, error: result.error || 'Export query failed.' };
    }

    const csvData = buildAuditCsvExport(result.records);

    return {
      success: true,
      csvData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export audit report.',
    };
  }
}
