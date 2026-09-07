/**
 * Stateful Background Task Engine Types
 */

export type TaskType =
  | 'GENERATE_TREATMENT_PLAN_PDF'
  | 'SCAN_PA_EXPIRATIONS'
  | 'BATCH_PAYROLL_SYNC';

export type TaskStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type TaskJob<T = Record<string, unknown>> = {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: T;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};
