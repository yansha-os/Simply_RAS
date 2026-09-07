import { describe, expect, it } from 'vitest';
import { enqueueTask, processNextTask, registerTaskHandler } from '../taskRunner';
import '../handlers/pdfCompilerTask';
import '../handlers/paExpirationTask';

describe('Stateful Background Task Engine', () => {
  it('enqueues and processes a PDF compilation task asynchronously', async () => {
    const job = enqueueTask('GENERATE_TREATMENT_PLAN_PDF', { clientId: 'test-client-123' });
    expect(job.status).toBe('QUEUED');
    expect(job.type).toBe('GENERATE_TREATMENT_PLAN_PDF');

    const processed = await processNextTask();
    expect(processed?.status).toBe('COMPLETED');
    expect(processed?.result?.success).toBe(true);
    expect(processed?.result?.clientId).toBe('test-client-123');
  });

  it('enqueues and processes a PA expiration scan task', async () => {
    const job = enqueueTask('SCAN_PA_EXPIRATIONS', { thresholdDays: 60 });
    expect(job.status).toBe('QUEUED');

    const processed = await processNextTask();
    expect(processed?.status).toBe('COMPLETED');
    expect(processed?.result?.expiringAuthsFound).toBe(3);
  });

  it('retries failed tasks up to maxAttempts', async () => {
    let attemptsCount = 0;
    registerTaskHandler('BATCH_PAYROLL_SYNC', async () => {
      attemptsCount++;
      if (attemptsCount === 1) {
        throw new Error('Transient network error');
      }
      return { success: true };
    });

    enqueueTask('BATCH_PAYROLL_SYNC', {}, 2);

    // First attempt -> fails, re-enqueues
    const attempt1 = await processNextTask();
    expect(attempt1?.status).toBe('QUEUED');

    // Second attempt -> succeeds
    const attempt2 = await processNextTask();
    expect(attempt2?.status).toBe('COMPLETED');
  });
});
