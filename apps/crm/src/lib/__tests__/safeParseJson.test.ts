import { describe, expect, it } from 'vitest';

import {
  INTAKE_PACKET_DOC_FLAG_KEYS,
  isIntakePacketDocFlagKey,
  parsePacketFormData,
  safeParseJson,
} from '../safeParseJson';

describe('safeParseJson', () => {
  it('returns objects and arrays as-is without reparsing', () => {
    const obj = { a: 1 };
    expect(safeParseJson(obj, {})).toBe(obj);
    const arr = [1, 2];
    expect(safeParseJson(arr, [])).toBe(arr);
  });

  it('parses singly stringified JSON', () => {
    expect(safeParseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('unwraps double-stringified JSON (legacy DB rows)', () => {
    const doubled = JSON.stringify(JSON.stringify({ childName: 'Kid A' }));
    expect(safeParseJson(doubled, {})).toEqual({ childName: 'Kid A' });
  });

  it('never throws on malformed JSON — returns the fallback', () => {
    expect(safeParseJson('{oops', { safe: true })).toEqual({ safe: true });
    expect(safeParseJson('"then {broken', 'fb')).toBe('fb');
  });

  it('returns the fallback for null, undefined, and JSON null', () => {
    expect(safeParseJson(null, 'fb')).toBe('fb');
    expect(safeParseJson(undefined, 'fb')).toBe('fb');
    expect(safeParseJson('null', 'fb')).toBe('fb');
  });

  it('passes through non-string primitives untouched', () => {
    expect(safeParseJson(42, 0)).toBe(42);
    expect(safeParseJson(false, true)).toBe(false);
  });
});

describe('parsePacketFormData', () => {
  it('returns a record for stringified and double-stringified objects', () => {
    expect(parsePacketFormData('{"a":1}')).toEqual({ a: 1 });
    expect(parsePacketFormData(JSON.stringify(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });

  it('returns {} for arrays, primitives, and malformed input', () => {
    expect(parsePacketFormData('[1,2,3]')).toEqual({});
    expect(parsePacketFormData('"just a string"')).toEqual({});
    expect(parsePacketFormData('7')).toEqual({});
    expect(parsePacketFormData('{nope')).toEqual({});
    expect(parsePacketFormData(null)).toEqual({});
  });
});

describe('isIntakePacketDocFlagKey (mass-assignment guard)', () => {
  it('accepts every whitelisted flag key', () => {
    for (const key of INTAKE_PACKET_DOC_FLAG_KEYS) {
      expect(isIntakePacketDocFlagKey(key)).toBe(true);
    }
  });

  it('rejects non-flag columns that a hostile client might send', () => {
    for (const key of [
      'magicLinkToken',
      'deviceFingerprint',
      'clientId',
      'id',
      '__proto__',
      'intakeFormComplete ',
      '',
    ]) {
      expect(isIntakePacketDocFlagKey(key)).toBe(false);
    }
  });
});
