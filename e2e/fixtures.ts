import { test as base, expect, type Page } from '@playwright/test';

/**
 * Console/page-error noise that is expected in dev mode and must not fail
 * smoke tests. Keep this list short and specific.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /Download the React DevTools/i,
  /Failed to load resource.*(favicon|manifest)/i,
  // Next.js dev overlay / HMR chatter
  /\[Fast Refresh\]/i,
  /hydration/i, // hydration warnings are real issues but owned by app teams, not this smoke gate
];

export interface ErrorCollector {
  /** Uncaught exceptions thrown in the page (window.onerror). Always a failure. */
  pageErrors: string[];
  /** console.error output, minus known dev-mode noise. */
  consoleErrors: string[];
}

/**
 * Attaches listeners that collect uncaught page exceptions and console errors.
 * Call before page.goto().
 */
export function collectErrors(page: Page): ErrorCollector {
  const collector: ErrorCollector = { pageErrors: [], consoleErrors: [] };

  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    collector.consoleErrors.push(text);
  });

  return collector;
}

export const test = base;
export { expect };
