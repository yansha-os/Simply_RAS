'use server'

import { prisma } from '@/lib/prisma'
import { resolveActingRbtContext } from '@/lib/resolveActingRbt'

async function resolveActiveRbt() {
  const acting = await resolveActingRbtContext()
  if (!acting.rbtUserId) {
    return { ok: false as const, error: 'No authenticated RBT identity. Please sign in.' }
  }

  const rbt = await prisma.user.findFirst({
    where: {
      id: acting.rbtUserId,
      role: 'RBT',
      isActive: true,
    },
    select: { id: true },
  })
  if (!rbt) {
    return { ok: false as const, error: 'Your active RBT staff account could not be verified.' }
  }

  return { ok: true as const, rbt }
}

/**
 * Retired assignment writer. Kept as a server-disabled compatibility facade
 * so stale clients cannot manufacture completed sessions from hidden form IDs.
 */
export async function logSession(_prevState: unknown, _formData: FormData) {
  try {
    void _prevState
    void _formData
    const acting = await resolveActiveRbt()
    if (!acting.ok) {
      return { error: acting.error }
    }

    return {
      error:
        'Direct session logging is disabled. Open your assigned scheduled session in Session Studio.',
    }
  } catch (error) {
    console.error(
      'Action failed [logSession]:',
      error instanceof Error ? error.message : 'Unknown error'
    )
    return { error: 'Unable to verify Session Studio access.' }
  }
}
