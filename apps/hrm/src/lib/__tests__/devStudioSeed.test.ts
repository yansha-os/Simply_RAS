import { describe, expect, it } from 'vitest';

import {
  DEMO_BEHAVIOR_TARGETS,
  DEMO_SKILL_TARGETS,
  demoSessionFixtureId,
  selectDemoSessionSlot,
  toDevSeedDiagnostic,
} from '../../../../../packages/db/src/devStudioSeed';
import { isDemoStudioTargetId } from '../sessionStudio';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Dev Studio seed fixtures', () => {
  it('uses stable UUIDs and visibly demo-only target labels', () => {
    const allTargets = [...DEMO_SKILL_TARGETS, ...DEMO_BEHAVIOR_TARGETS];
    const ids = allTargets.map((target) => target.id);

    expect(ids.every((id) => UUID_RE.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allTargets.every((target) => target.label.startsWith('[DEMO]'))).toBe(true);
  });

  it('keeps durable seeded UUIDs outside the placeholder target gate', () => {
    expect(isDemoStudioTargetId(DEMO_SKILL_TARGETS[0].id)).toBe(false);
    expect(isDemoStudioTargetId(DEMO_BEHAVIOR_TARGETS[0].id)).toBe(false);
    expect(isDemoStudioTargetId('t1')).toBe(true);
    expect(isDemoStudioTargetId('b1')).toBe(true);
  });

  it('reuses the same scheduled slot on repeated seeds', () => {
    const id = demoSessionFixtureId('CLAIM_READY', 1);

    expect(
      selectDemoSessionSlot('CLAIM_READY', [
        { id, status: 'SCHEDULED', hasNote: false, isConverted: false },
      ])
    ).toEqual({ id, generation: 1, shouldCreate: false });
  });

  it('advances instead of overwriting a converted historical note', () => {
    const convertedId = demoSessionFixtureId('CLAIM_READY', 1);
    const nextId = demoSessionFixtureId('CLAIM_READY', 2);

    expect(
      selectDemoSessionSlot('CLAIM_READY', [
        {
          id: convertedId,
          status: 'COMPLETED',
          hasNote: true,
          isConverted: true,
        },
      ])
    ).toEqual({ id: nextId, generation: 2, shouldCreate: true });
  });

  it('keeps incomplete and claim-ready branches on separate IDs', () => {
    expect(demoSessionFixtureId('INCOMPLETE', 1)).not.toBe(
      demoSessionFixtureId('CLAIM_READY', 1)
    );
  });

  it('emits only the technical code and message for diagnostics', () => {
    expect(
      toDevSeedDiagnostic({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`id`)',
        client: { guardianName: 'must not be copied' },
      })
    ).toEqual({
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`id`)',
    });
  });
});
