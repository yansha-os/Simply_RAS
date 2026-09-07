/**
 * Cures Act State EVV Aggregator Interface Types
 * Standardized data models for HHAeXchange, Sandata, and Tellus Open EVV APIs.
 */

export type EvvAggregatorVendor = 'HHAEXCHANGE' | 'SANDATA' | 'TELLUS';
export type EvvAggregatorStatus = 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';

export type CuresActEvvLocation = {
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type CuresActEvvPayload = {
  evvLogId: string;
  sessionId: string;
  providerNpi: string;
  providerMedicaidId?: string;
  clientMedicaidId: string;
  staffNpi?: string;
  staffId: string;
  cptCode: string;
  placeOfServiceCode: string;
  clockIn: CuresActEvvLocation;
  clockOut: CuresActEvvLocation;
  billableUnits: number;
  vendor: EvvAggregatorVendor;
};

export type EvvSubmissionResult = {
  success: boolean;
  vendor: EvvAggregatorVendor;
  responseId?: string;
  errorMessage?: string;
  submittedAt: string;
};
