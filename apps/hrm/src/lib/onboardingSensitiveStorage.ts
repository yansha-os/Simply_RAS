import { createCipheriv, randomBytes } from 'node:crypto';
import type { EmbeddedFormPayload } from '@/lib/embeddedOnboardingForms';

type EncryptedField = {
  v: 1;
  alg: 'A256GCM';
  iv: string;
  ciphertext: string;
  tag: string;
};

export type OnboardingEncryptionReadiness = 'ok' | 'error';

function decodeEncryptionKey(encoded: string): Buffer | null {
  const key = Buffer.from(encoded, 'base64');
  return key.length === 32 && key.toString('base64') === encoded ? key : null;
}

/** Non-secret readiness signal shared by health checks and encrypted writes. */
export function getOnboardingEncryptionReadiness(): OnboardingEncryptionReadiness {
  const encoded = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY?.trim();
  return encoded && decodeEncryptionKey(encoded) ? 'ok' : 'error';
}

function encryptionKey(): Buffer {
  const encoded = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY is not configured');
  }

  const key = decodeEncryptionKey(encoded);
  if (!key) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key');
  }
  return key;
}

function encrypt(value: string, context: string): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

/** Encrypts high-risk onboarding values before they cross the Prisma boundary. */
export function protectOnboardingFormForStorage(
  candidateId: string,
  payload: EmbeddedFormPayload,
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const protect = (field: string, value: string) =>
    encrypt(value, `${candidateId}:${payload.key}:${field}`);

  if (payload.key === 'form-w4' || payload.key === 'form-it-2104') {
    return { ...normalized, ssn: protect('ssn', String(normalized.ssn ?? '')) };
  }

  if (payload.key === 'direct-deposit') {
    return {
      ...normalized,
      ssnLast4: protect('ssnLast4', String(normalized.ssnLast4 ?? '')),
      routingNumber: protect('routingNumber', String(normalized.routingNumber ?? '')),
      accountNumber: protect('accountNumber', String(normalized.accountNumber ?? '')),
      secondaryRoutingNumber: protect(
        'secondaryRoutingNumber',
        String(normalized.secondaryRoutingNumber ?? '')
      ),
      secondaryAccountNumber: protect(
        'secondaryAccountNumber',
        String(normalized.secondaryAccountNumber ?? '')
      ),
    };
  }

  return {
    ...normalized,
    dateOfBirth: protect('dateOfBirth', String(normalized.dateOfBirth ?? '')),
    ssnLast4: protect('ssnLast4', String(normalized.ssnLast4 ?? '')),
  };
}
