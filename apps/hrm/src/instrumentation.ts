import type { Instrumentation } from 'next';
import { logError } from '@/lib/logger';
import { redactSensitiveUrl } from '@/lib/redactSensitiveUrl';

/**
 * Server-side error visibility (docs/OPERATIONS.md §3).
 *
 * `onRequestError` fires for every uncaught error in server components,
 * server actions, route handlers, and middleware — one structured JSON
 * line per failure so host log alerts can key off `server.request_error`.
 *
 * PHI rule: log framework route templates/digest/method only. Never log
 * request paths, URLs, exception messages, or user-supplied content.
 */

export function register(): void {
  // No SDKs to boot yet; exists so Next loads this file at startup.
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const digestCandidate =
    err instanceof Error
      ? (err as Error & { digest?: unknown }).digest
      : undefined;
  const digest =
    typeof digestCandidate === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(digestCandidate)
      ? digestCandidate
      : undefined;

  logError('server.request_error', {
    errorType: err instanceof Error ? 'Error' : 'UnknownThrownValue',
    digest,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
    routePattern: redactSensitiveUrl(context.routePath),
  });
};
