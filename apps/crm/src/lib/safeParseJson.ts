/**
 * Crash-proof JSON access for DB blobs (audit H8/M9).
 * Some IntakePacket.formData rows are double-stringified ("\"{\\\"a\\\":1}\"");
 * a single malformed row must never 500 a server action or white-screen a tab.
 */

/** Parse a JSON value that may be a string, double-stringified, or already an object. Never throws. */
export function safeParseJson<T = unknown>(raw: unknown, fallback: T): T {
  let value: unknown = raw;
  try {
    // Unwrap up to two levels of stringification (observed in legacy rows)
    for (let i = 0; i < 2 && typeof value === 'string'; i++) {
      value = JSON.parse(value);
    }
  } catch {
    return fallback;
  }
  if (value === null || value === undefined) return fallback;
  return value as T;
}

/** IntakePacket.formData as a plain record — `{}` when missing/malformed. */
export function parsePacketFormData(raw: unknown): Record<string, unknown> {
  const parsed = safeParseJson<unknown>(raw, {});
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/**
 * IntakePacket boolean document/form flags that staff review actions may
 * legally toggle. Derived from prisma/schema.prisma IntakePacket — keep in
 * sync when adding doc-flag columns. Never write a client-supplied key that
 * is not in this list (mass-assignment guard).
 */
export const INTAKE_PACKET_DOC_FLAG_KEYS = [
  'intakeFormComplete',
  'consentFormComplete',
  'insuranceCardFrontUploaded',
  'insuranceCardBackUploaded',
  'medicaidCardFrontUploaded',
  'medicaidCardBackUploaded',
  'diagnosticEvalUploaded',
  'physicianRxUploaded',
  'iepUploaded',
  'custodyDocsUploaded',
  'priorAbaRecordsUploaded',
] as const;

export type IntakePacketDocFlagKey = (typeof INTAKE_PACKET_DOC_FLAG_KEYS)[number];

export function isIntakePacketDocFlagKey(key: string): key is IntakePacketDocFlagKey {
  return (INTAKE_PACKET_DOC_FLAG_KEYS as readonly string[]).includes(key);
}
