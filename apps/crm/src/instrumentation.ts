import type { Instrumentation } from 'next';
import { logError } from '@/lib/logger';

/**
 * Server-side error visibility (docs/OPERATIONS.md §3).
 *
 * `onRequestError` fires for every uncaught error in server components,
 * server actions, route handlers, and middleware — one structured JSON
 * line per failure so host log alerts can key off `server.request_error`.
 *
 * PHI rule: log route/digest/method only. Never log request bodies,
 * search params, or user-supplied content. Magic-link tokens appear in
 * the URL path, so the path is redacted before logging.
 */

export function register(): void {
  // No SDKs to boot yet; exists so Next loads this file at startup.
}

function redactPath(path: string): string {
  return path.replace(/\/magic-link\/[^/?]+/, '/magic-link/[token]');
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logError('server.request_error', {
    message: error.message,
    digest: (error as { digest?: string }).digest,
    method: request.method,
    path: redactPath(request.path),
    routerKind: context.routerKind,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
