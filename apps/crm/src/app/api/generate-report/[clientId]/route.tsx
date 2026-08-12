import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import React from 'react';
import { renderToStream } from '@react-pdf/renderer';
import { TreatmentPlanPDF } from '@/lib/pdf/TreatmentPlanPDF';
import { requireClientAccess } from '@/lib/auth-guard';
import { writeAuditLog } from '@/lib/auditLog';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    if (!clientId || clientId.length > 128) {
      return new NextResponse('Invalid client', { status: 400 });
    }

    // Gap 13: role + client-assignment check (leadership/intake/billing see all;
    // BCBA / RBT must be assigned to this client). Impersonation-aware.
    const gate = await requireClientAccess(clientId);
    if (!gate.ok) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        // Everything the report model reads: goal baselines/mastery from the
        // synced Session Studio targets, BCBA of record, intake diagnosis.
        skillTargets: { orderBy: { createdAt: 'asc' } },
        behaviorTargets: { orderBy: { createdAt: 'asc' } },
        bcba: { select: { firstName: true, lastName: true } },
        // formData only — never pull magic-link token fields into this path
        intakePacket: { select: { formData: true } },
      },
    });

    if (!client) {
      return new NextResponse('Client not found', { status: 404 });
    }

    // PHI access audit (gap 12) — ids only, fire-and-forget so it can never
    // block or fail the report download (writeAuditLog swallows its own errors).
    void writeAuditLog({
      actorUserId: gate.user.id,
      action: 'EXPORT',
      entityType: 'CLIENT',
      entityId: clientId,
      meta: {
        event: 'TREATMENT_PLAN_PDF_EXPORT',
        report: 'treatment-plan',
        clientId,
      },
    });

    const treatmentPlan =
      client.treatmentPlan && typeof client.treatmentPlan === 'object'
        ? client.treatmentPlan
        : {};

    const pdfStream = await renderToStream(
      <TreatmentPlanPDF client={client} treatmentPlan={treatmentPlan} />
    );

    const readableStream = new ReadableStream({
      start(controller) {
        pdfStream.on('data', (chunk) => controller.enqueue(chunk));
        pdfStream.on('end', () => controller.close());
        pdfStream.on('error', (err) => controller.error(err));
      },
    });

    const safeLast = String(client.lastName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Treatment_Plan_${safeLast}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate PDF:', error instanceof Error ? error.message : 'Unknown');
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
