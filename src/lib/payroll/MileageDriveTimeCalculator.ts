/**
 * Automated GPS Route Distance & Mileage Payroll Engine
 * Phase 6 - Staff Mileage & Travel Reimbursement
 */

export interface SessionTravelLeg {
  fromAddress: string;
  toAddress: string;
  distanceMiles: number;
  driveTimeMinutes: number;
  mileageRatePerMile: number; // e.g. 0.67 ($/mile IRS standard)
  driveTimeHourlyRate: number; // e.g. $15.00/hr
}

export interface TravelPayrollSummaryResult {
  totalLegs: number;
  totalMiles: number;
  totalDriveTimeMinutes: number;
  mileageReimbursementPay: number;
  driveTimeHourlyPay: number;
  totalTravelPayroll: number;
}

/**
 * Computes travel mileage reimbursement and drive-time pay for an employee's session route
 */
export function calculateStaffTravelPayroll(legs: SessionTravelLeg[]): TravelPayrollSummaryResult {
  let totalMiles = 0;
  let totalMinutes = 0;
  let totalMileagePay = 0;
  let totalDriveTimePay = 0;

  legs.forEach((leg) => {
    totalMiles += leg.distanceMiles;
    totalMinutes += leg.driveTimeMinutes;

    const legMileagePay = leg.distanceMiles * leg.mileageRatePerMile;
    const legDriveTimePay = (leg.driveTimeMinutes / 60) * leg.driveTimeHourlyRate;

    totalMileagePay += legMileagePay;
    totalDriveTimePay += legDriveTimePay;
  });

  return {
    totalLegs: legs.length,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalDriveTimeMinutes: totalMinutes,
    mileageReimbursementPay: Math.round(totalMileagePay * 100) / 100,
    driveTimeHourlyPay: Math.round(totalDriveTimePay * 100) / 100,
    totalTravelPayroll: Math.round((totalMileagePay + totalDriveTimePay) * 100) / 100,
  };
}
