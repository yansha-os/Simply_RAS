import { afterEach, describe, expect, it } from 'vitest';
import { getOnboardingEncryptionReadiness } from './onboardingSensitiveStorage';

const ORIGINAL_KEY = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
  } else {
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('getOnboardingEncryptionReadiness', () => {
  it('rejects a missing key', () => {
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    expect(getOnboardingEncryptionReadiness()).toBe('error');
  });

  it.each(['not-base64', Buffer.alloc(31).toString('base64'), ' YWJjZA== '])(
    'rejects malformed or incorrectly sized key %s',
    (key) => {
      process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = key;
      expect(getOnboardingEncryptionReadiness()).toBe('error');
    }
  );

  it('accepts a canonical base64-encoded 32-byte key', () => {
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    expect(getOnboardingEncryptionReadiness()).toBe('ok');
  });
});
