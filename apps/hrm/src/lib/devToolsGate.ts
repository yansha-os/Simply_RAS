/**
 * Prod env-lock for dev tools (readiness audit Blocker 5).
 *
 * NEXT_PUBLIC_ENABLE_DEV_TOOLS must never be 'true' when NODE_ENV === 'production':
 * dev tools include password-less impersonation and demo seeding over real data.
 *
 * Imported for its boot-time side effect from the root layout, and used as the
 * single gate by the dev-tools UI and every devTools server action.
 */

const DEV_TOOLS_FLAG_ON = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && DEV_TOOLS_FLAG_ON) {
  const message =
    '[SECURITY] FATAL: NEXT_PUBLIC_ENABLE_DEV_TOOLS=true while NODE_ENV=production. ' +
    'Dev tools (impersonation / demo seeding) must never be enabled in a production build. ' +
    'Unset NEXT_PUBLIC_ENABLE_DEV_TOOLS in this environment and rebuild.';
  console.error(message);
  throw new Error(message);
}

/**
 * Single source of truth: dev tools are enabled only outside production AND
 * with the public flag explicitly on. Always false in production (the assert
 * above makes a misconfigured prod build fail loudly instead).
 */
export function isDevToolsEnabled(): boolean {
  return !IS_PRODUCTION && DEV_TOOLS_FLAG_ON;
}
