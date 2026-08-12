import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listClinicalReviewQueue: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/app/actions/clinicalReviewActions', () => ({
  listClinicalReviewQueue: mocks.listClinicalReviewQueue,
}));

vi.mock('@/components/portal-clinical/ClinicalReviewQueue', () => ({
  default: function ClinicalReviewQueueStub() {
    return null;
  },
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

import ClinicalReviewPage from './page';

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const EMPTY_COUNTS = { packet: 0, unsigned: 0, deficiency: 0, total: 0 };

type ElementProps = Record<string, unknown> & { children?: React.ReactNode };

function findElementWithProps(
  node: React.ReactNode,
  requiredProps: string[]
): React.ReactElement<ElementProps> | null {
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<ElementProps>;
  if (requiredProps.every((key) => key in element.props)) return element;

  for (const child of React.Children.toArray(element.props.children)) {
    const match = findElementWithProps(child, requiredProps);
    if (match) return match;
  }
  return null;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.notFound.mockImplementation(() => {
    throw new Error(NOT_FOUND);
  });
});

describe('ClinicalReviewPage', () => {
  it('uses the same non-leaky 404 for a denied loader result', async () => {
    mocks.listClinicalReviewQueue.mockResolvedValue({
      success: false,
      accessDenied: true,
      error: 'Not found.',
      items: [],
      counts: EMPTY_COUNTS,
    });

    await expect(ClinicalReviewPage()).rejects.toThrow(NOT_FOUND);
  });

  it('preserves the authorized queue UI and stable load error', async () => {
    mocks.listClinicalReviewQueue.mockResolvedValue({
      success: false,
      accessDenied: false,
      error: 'Unable to load clinical review queue.',
      items: [],
      counts: EMPTY_COUNTS,
    });

    const page = await ClinicalReviewPage();
    const queue = findElementWithProps(page, ['items', 'counts', 'loadError']);

    expect(queue?.props.items).toEqual([]);
    expect(queue?.props.counts).toEqual(EMPTY_COUNTS);
    expect(queue?.props.loadError).toBe('Unable to load clinical review queue.');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
