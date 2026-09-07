import type {
  CuresActEvvPayload,
  EvvAggregatorVendor,
  EvvSubmissionResult,
} from './evvAggregatorTypes';
import { submitToHhaExchange } from './hhaExchangeAdapter';
import { submitToSandata } from './sandataAdapter';

/**
 * State EVV Aggregator Central Submission Dispatcher
 * Selects vendor adapter based on client state / payer settings and handles execution.
 */

export async function dispatchEvvToAggregator(
  payload: CuresActEvvPayload
): Promise<EvvSubmissionResult> {
  const vendor: EvvAggregatorVendor = payload.vendor || 'HHAEXCHANGE';

  switch (vendor) {
    case 'SANDATA':
      return submitToSandata(payload);
    case 'HHAEXCHANGE':
    default:
      return submitToHhaExchange(payload);
  }
}
