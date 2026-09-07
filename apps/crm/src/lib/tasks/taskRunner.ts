import type { TaskJob, TaskType } from './taskTypes';

type TaskHandler = (job: TaskJob) => Promise<Record<string, unknown>>;

const registeredHandlers: Map<TaskType, TaskHandler> = new Map();
const inMemoryQueue: TaskJob[] = [];

export function registerTaskHandler(type: TaskType, handler: TaskHandler) {
  registeredHandlers.set(type, handler);
}

const MAX_QUEUE_HISTORY = 500;

export function enqueueTask<T = Record<string, unknown>>(
  type: TaskType,
  payload: T,
  maxAttempts = 3
): TaskJob<T> {
  // Prune terminal jobs if memory queue grows past limit
  if (inMemoryQueue.length > MAX_QUEUE_HISTORY) {
    const terminalIndices: number[] = [];
    for (let i = 0; i < inMemoryQueue.length; i++) {
      if (inMemoryQueue[i].status === 'COMPLETED' || inMemoryQueue[i].status === 'FAILED') {
        terminalIndices.push(i);
      }
    }
    // Remove oldest completed/failed items
    if (terminalIndices.length > 50) {
      const toRemove = new Set(terminalIndices.slice(0, terminalIndices.length - 50));
      const pruned = inMemoryQueue.filter((_, idx) => !toRemove.has(idx));
      inMemoryQueue.length = 0;
      inMemoryQueue.push(...pruned);
    }
  }

  const job: TaskJob<T> = {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    status: 'QUEUED',
    payload,
    attempts: 0,
    maxAttempts,
    queuedAt: new Date().toISOString(),
  };

  inMemoryQueue.push(job as unknown as TaskJob);

  // Process asynchronously without awaiting to unblock caller immediately
  setTimeout(() => {
    void processNextTask();
  }, 10);

  return job;
}

export async function processNextTask(): Promise<TaskJob | null> {
  const job = inMemoryQueue.find((j) => j.status === 'QUEUED');
  if (!job) return null;

  // Immediately lock to PROCESSING synchronously before awaiting anything
  job.status = 'PROCESSING';
  job.attempts += 1;
  job.startedAt = new Date().toISOString();

  const handler = registeredHandlers.get(job.type);
  if (!handler) {
    job.status = 'FAILED';
    job.error = `No handler registered for task type: ${job.type}`;
    job.completedAt = new Date().toISOString();
    return job;
  }

  try {
    const result = await handler(job);
    job.status = 'COMPLETED';
    job.result = result;
    job.completedAt = new Date().toISOString();
    return job;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (job.attempts < job.maxAttempts) {
      job.status = 'QUEUED'; // Retry
      setTimeout(() => {
        void processNextTask();
      }, 500 * job.attempts); // Exponential-like backoff
    } else {
      job.status = 'FAILED';
      job.error = errorMsg;
      job.completedAt = new Date().toISOString();
    }
    return job;
  }
}

export function getTaskStatus(taskId: string): TaskJob | undefined {
  return inMemoryQueue.find((j) => j.id === taskId);
}
