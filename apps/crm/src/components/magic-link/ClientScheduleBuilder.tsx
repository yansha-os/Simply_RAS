'use client';

import React, { useMemo, useState, useTransition } from 'react';
import type { Client, PARequest } from '@prisma/client';
import { Calendar, Clock, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { saveClientSchedule } from '@/app/actions/intake';

type ScheduleBlock = { start: string; end: string };
type ClientSchedule = Record<string, ScheduleBlock | null>;
type StaffingPreferences = { gender: string; race: string; age: string; language: string; notes: string };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const EMPTY_SCHEDULE: ClientSchedule = Object.fromEntries(DAYS.map((day) => [day, null]));
const EMPTY_PREFERENCES: StaffingPreferences = { gender: '', race: '', age: '', language: '', notes: '' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTreatmentPlan(value: Client['treatmentPlan']): {
  hours97153: number;
  preferredSchedule: ClientSchedule | null;
  staffingPreferences: StaffingPreferences | null;
} {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  if (!isRecord(parsed)) {
    return { hours97153: 0, preferredSchedule: null, staffingPreferences: null };
  }

  const schedule = isRecord(parsed.preferredSchedule)
    ? Object.fromEntries(Object.entries(parsed.preferredSchedule).map(([day, block]) => {
        if (block === null) return [day, null];
        return isRecord(block) && typeof block.start === 'string' && typeof block.end === 'string'
          ? [day, { start: block.start, end: block.end }]
          : [day, null];
      })) as ClientSchedule
    : null;
  const prefs = parsed.staffingPreferences;
  const staffingPreferences = isRecord(prefs)
    ? {
        gender: typeof prefs.gender === 'string' ? prefs.gender : '',
        race: typeof prefs.race === 'string' ? prefs.race : '',
        age: typeof prefs.age === 'string' ? prefs.age : '',
        language: typeof prefs.language === 'string' ? prefs.language : '',
        notes: typeof prefs.notes === 'string' ? prefs.notes : '',
      }
    : null;

  return {
    hours97153: typeof parsed.hours97153 === 'number' ? parsed.hours97153 : 0,
    preferredSchedule: schedule,
    staffingPreferences,
  };
}

function formatTimeDisplay(time24: string) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${period}`;
}

function TimePickerWizard({ 
  label,
  onChange,
  onClose
}: { 
  label: string,
  onChange: (val: string) => void,
  onClose: () => void
}) {
  const [step, setStep] = useState<'hour'|'minute'|'period'>('hour');
  const [temp, setTemp] = useState({ h: '', m: '', p: '' });

  const handleSelect = (val: string) => {
    if (step === 'hour') { setTemp(p => ({ ...p, h: val })); setStep('minute'); }
    else if (step === 'minute') { setTemp(p => ({ ...p, m: val })); setStep('period'); }
    else if (step === 'period') { 
      const pStr = val;
      let h = parseInt(temp.h, 10);
      if (pStr === 'PM' && h !== 12) h += 12;
      if (pStr === 'AM' && h === 12) h = 0;
      onChange(`${h.toString().padStart(2, '0')}:${temp.m}`);
      onClose();
    }
  };

  const getGrid = () => {
    if (step === 'hour') return [1,2,3,4,5,6,7,8,9,10,11,12].map(String);
    if (step === 'minute') return ['00', '15', '30', '45'];
    if (step === 'period') return ['AM', 'PM'];
    return [];
  };

  return (
    <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 w-[280px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
          {label}
          <span className="text-xs font-bold uppercase text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
            {step}
          </span>
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {getGrid().map(item => (
          <button
            key={item}
            onClick={() => handleSelect(item)}
            className="bg-slate-50 border border-slate-200 hover:border-orange-500 hover:bg-orange-50 text-slate-800 font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ClientScheduleBuilder({ client, paRequests }: {
  client: Pick<Client, 'id' | 'treatmentPlan'>;
  paRequests: Array<Pick<PARequest, 'type' | 'approvedUnits'>>;
}) {
  const [isPending, startTransition] = useTransition();
  const [isSaved, setIsSaved] = useState(false);
  const treatmentPlan = useMemo(() => parseTreatmentPlan(client.treatmentPlan), [client.treatmentPlan]);
  
  const treatmentPa = paRequests.find((paRequest) => paRequest.type === 'TREATMENT');
  
  // Try to use approvedUnits from PA (1 hour = 4 units per user request)
  // Fallback to treatmentPlan.hours97153 if missing
  const totalApprovedHours = treatmentPa?.approvedUnits 
    ? Math.floor(treatmentPa.approvedUnits / 4) 
    : treatmentPlan.hours97153;

  const [lastTreatmentPlan, setLastTreatmentPlan] = useState(treatmentPlan);
  const [schedule, setSchedule] = useState<ClientSchedule>(treatmentPlan.preferredSchedule || EMPTY_SCHEDULE);

  const [step, setStep] = useState<1 | 2>(1);
  const [preferences, setPreferences] = useState<StaffingPreferences>(treatmentPlan.staffingPreferences || EMPTY_PREFERENCES);

  if (treatmentPlan !== lastTreatmentPlan) {
    setLastTreatmentPlan(treatmentPlan);
    if (treatmentPlan.preferredSchedule) {
      setSchedule(treatmentPlan.preferredSchedule);
    }
    if (treatmentPlan.staffingPreferences) {
      setPreferences(treatmentPlan.staffingPreferences);
    }
  }

  const [activeWizard, setActiveWizard] = useState<{ day: string, type: 'start'|'end' } | null>(null);

  const calculateTotalScheduledHours = () => {
    let totalMinutes = 0;
    
    Object.values(schedule).forEach(day => {
      if (!day) return;
      if (!day.start || !day.end) return;
      const parseTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      
      const startMinutes = parseTime(day.start);
      const endMinutes = parseTime(day.end);
      if (endMinutes > startMinutes) {
        totalMinutes += (endMinutes - startMinutes);
      }
    });
    
    return totalMinutes / 60;
  };

  const handleTimeChange = (day: string, field: 'start'|'end', val: string) => {
    setSchedule(prev => {
      const existing = prev[day] || { start: '09:00', end: '11:00' };
      return { ...prev, [day]: { ...existing, [field]: val } };
    });
  };

  const getLogicalErrors = () => {
    const errors: Record<string, string> = {};
    const parse = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    Object.entries(schedule).forEach(([day, val]) => {
      if (val && val.start && val.end) {
        if (parse(val.end) <= parse(val.start)) {
          errors[day] = "End time must be after start time.";
        }
      }
    });
    return errors;
  };

  const logicalErrors = getLogicalErrors();
  const hasLogicalErrors = Object.keys(logicalErrors).length > 0;

  const currentScheduledHours = calculateTotalScheduledHours();
  const minRequiredHours = totalApprovedHours * 0.8;
  const isOverLimit = currentScheduledHours > totalApprovedHours;
  const isUnderLimit = currentScheduledHours < minRequiredHours;
  const isComplete = currentScheduledHours > 0 && !isOverLimit && !isUnderLimit && !hasLogicalErrors;

  const isPreferencesComplete = !!(preferences.gender && preferences.race && preferences.age && preferences.language);

  const handleSave = () => {
    startTransition(async () => {
      await saveClientSchedule(client.id, schedule, preferences);
      setIsSaved(true);
      setStep(1);
    });
  };

  if (isSaved) {
    return (
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-400 bg-emerald-50/90 p-8 shadow-xl text-center text-slate-900 animate-slide-up">
        <div className="w-16 h-16 bg-emerald-100 border border-emerald-300 rounded-3xl flex items-center justify-center mx-auto mb-4 text-emerald-700 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 font-heading mb-2">Schedule Preferences Saved!</h2>
        <p className="text-slate-700 font-medium mb-6">Our operations and clinical team will use this to match your BCBA and RBT.</p>
        <button 
          onClick={() => setIsSaved(false)}
          className="bg-white hover:bg-[#F9F5EC] text-slate-800 border border-[#E2D5B7] px-6 py-2.5 rounded-xl font-bold transition-all text-xs cursor-pointer shadow-xs"
        >
          Edit Schedule
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-[#FFFDF8] border border-[#E2D5B7] p-6 sm:p-8 rounded-3xl shadow-xl shadow-orange-950/5 space-y-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.10),_transparent_58%)]" />

      <div className="relative flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-orange-100 rounded-2xl text-[#EA580C] border border-orange-200">
          <Calendar className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 font-heading">Build Your Weekly Schedule</h2>
          <p className="text-xs text-slate-500">Configure your child&apos;s preferred therapy session blocks</p>
        </div>
      </div>
      
      <p className="relative text-sm text-slate-600 leading-relaxed font-medium">
        Your authorization for <strong>{totalApprovedHours} hours/week</strong> has been approved. 
        Please select your preferred times for in-home therapy. We require scheduling at least 80% ({minRequiredHours} hours) of your authorized time to ensure optimal clinical outcomes.
      </p>

      {/* Progress Bar */}
      <div className="relative bg-[#F9F5EC] rounded-2xl p-5 border border-[#E2D5B7] mb-6">
        <div className="flex justify-between items-end mb-2">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 font-mono">Scheduled vs Approved</div>
            <div className={`text-2xl font-black ${isOverLimit ? 'text-red-600' : (isUnderLimit ? 'text-[#C2410C]' : 'text-emerald-700')}`}>
              {currentScheduledHours.toFixed(2)} <span className="text-sm text-slate-500 font-normal">/ {totalApprovedHours} hours</span>
            </div>
          </div>
          <div className="text-right">
            {isOverLimit ? (
              <span className="text-xs text-red-700 font-bold bg-red-100 px-3 py-1 rounded-full border border-red-200">Over Limit</span>
            ) : isUnderLimit ? (
              <span className="text-xs text-[#C2410C] font-bold bg-[#FFF5ED] px-3 py-1 rounded-full border border-[#FFD8C2]">Min {minRequiredHours} hrs required</span>
            ) : (
              <span className="text-xs text-emerald-800 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-300">Ready to Submit!</span>
            )}
          </div>
        </div>
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden relative border border-[#E2D5B7]">
          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-slate-400 z-10" />
          <div 
            className={`h-full transition-all duration-300 relative z-0 ${isOverLimit ? 'bg-red-500' : (isUnderLimit ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-emerald-500')}`}
            style={{ width: `${Math.min(100, (currentScheduledHours / totalApprovedHours) * 100)}%` }}
          />
        </div>
      </div>

      {/* Days Grid */}
      <div className="relative space-y-3">
        {DAYS.map(day => {
          const isSelected = schedule[day] !== null;
          const errorMsg = logicalErrors[day];

          return (
            <div key={day} className="flex flex-col">
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition-colors gap-4 ${isSelected ? (errorMsg ? 'bg-red-50 border-red-300' : 'bg-[#FFF5ED]/70 border-[#FFD8C2]') : 'bg-[#F9F5EC]/60 border-[#E2D5B7]'}`}>
                <div className="flex items-center gap-4">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSchedule(prev => ({ ...prev, [day]: { start: '09:00', end: '11:00' } }));
                      } else {
                        setSchedule(prev => ({ ...prev, [day]: null }));
                      }
                    }}
                    className="w-5 h-5 rounded-lg border-slate-300 text-orange-600 focus:ring-orange-500/30 cursor-pointer"
                  />
                  <span className={`font-bold text-sm ${isSelected ? (errorMsg ? 'text-red-700' : 'text-slate-900') : 'text-slate-500'}`}>{day}</span>
                </div>
                
                {isSelected && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Start Time Picker */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveWizard(activeWizard?.day === day && activeWizard?.type === 'start' ? null : { day, type: 'start' })}
                        className={`flex items-center gap-2 bg-white border hover:bg-[#F9F5EC] rounded-xl px-3.5 py-2 transition-all cursor-pointer shadow-xs ${activeWizard?.day === day && activeWizard?.type === 'start' ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-[#E2D5B7]'}`}
                      >
                        <Clock className="w-4 h-4 text-[#EA580C]" />
                        <span className="text-slate-900 text-sm font-semibold">
                          {formatTimeDisplay(schedule[day]?.start || '09:00')}
                        </span>
                      </button>

                      {activeWizard?.day === day && activeWizard?.type === 'start' && (
                        <TimePickerWizard 
                          label="Start Time"
                          onChange={(val) => handleTimeChange(day, 'start', val)}
                          onClose={() => setActiveWizard(null)}
                        />
                      )}
                    </div>

                    <span className="text-slate-400 font-medium text-xs">to</span>

                    {/* End Time Picker */}
                    <div className="relative">
                      <button 
                        onClick={() => setActiveWizard(activeWizard?.day === day && activeWizard?.type === 'end' ? null : { day, type: 'end' })}
                        className={`flex items-center gap-2 bg-white border hover:bg-[#F9F5EC] rounded-xl px-3.5 py-2 transition-all cursor-pointer shadow-xs ${activeWizard?.day === day && activeWizard?.type === 'end' ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-[#E2D5B7]'}`}
                      >
                        <Clock className="w-4 h-4 text-[#EA580C]" />
                        <span className="text-slate-900 text-sm font-semibold">
                          {formatTimeDisplay(schedule[day]?.end || '11:00')}
                        </span>
                      </button>

                      {activeWizard?.day === day && activeWizard?.type === 'end' && (
                        <TimePickerWizard 
                          label="End Time"
                          onChange={(val) => handleTimeChange(day, 'end', val)}
                          onClose={() => setActiveWizard(null)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Logical Error Message */}
              {isSelected && errorMsg && (
                <div className="mt-1.5 ml-4 text-xs text-red-600 font-medium flex items-center gap-1">
                  <span>⚠️</span> {errorMsg} Adjust the start or end time to fix.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {step === 1 ? (
        <button
          onClick={() => setStep(2)}
          disabled={!isComplete}
          className={`w-full mt-6 font-black py-4 rounded-2xl transition-all duration-300 ${
            isComplete
              ? 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 cursor-pointer hover:scale-[1.01]'
              : 'bg-[#E2D5B7] text-[#8C826A] cursor-not-allowed'
          }`}
        >
          Next: Staffing Preferences <ChevronRight className="inline w-5 h-5 ml-1" />
        </button>
      ) : (
        <div className="mt-8 pt-8 border-t border-[#E2D5B7] animate-slide-up space-y-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 font-heading">Staffing Preferences</h2>
            <p className="text-xs text-slate-500 mt-1">
              Please let us know your preferences so we can match the ideal clinical practitioner for your child.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Preferred Gender</label>
                <select 
                  value={preferences.gender} 
                  onChange={e => setPreferences({...preferences, gender: e.target.value})}
                  className="w-full bg-white border border-[#E2D5B7] rounded-xl p-3 text-slate-900 focus:border-orange-500 outline-none"
                >
                  <option value="">Select gender...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Preferred Race/Ethnicity</label>
                <select 
                  value={preferences.race} 
                  onChange={e => setPreferences({...preferences, race: e.target.value})}
                  className="w-full bg-white border border-[#E2D5B7] rounded-xl p-3 text-slate-900 focus:border-orange-500 outline-none"
                >
                  <option value="">Select race/ethnicity...</option>
                  <option value="Asian">Asian</option>
                  <option value="Black/African American">Black/African American</option>
                  <option value="Hispanic/Latino">Hispanic/Latino</option>
                  <option value="White">White</option>
                  <option value="Other">Other</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Preferred Age Range</label>
                <select 
                  value={preferences.age} 
                  onChange={e => setPreferences({...preferences, age: e.target.value})}
                  className="w-full bg-white border border-[#E2D5B7] rounded-xl p-3 text-slate-900 focus:border-orange-500 outline-none"
                >
                  <option value="">Select age range...</option>
                  <option value="20s">20s</option>
                  <option value="30s">30s</option>
                  <option value="40s+">40s+</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Preferred Language</label>
                <select 
                  value={preferences.language} 
                  onChange={e => setPreferences({...preferences, language: e.target.value})}
                  className="w-full bg-white border border-[#E2D5B7] rounded-xl p-3 text-slate-900 focus:border-orange-500 outline-none"
                >
                  <option value="">Select language...</option>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Mandarin">Mandarin</option>
                  <option value="Other">Other</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Additional Notes (Optional)</label>
              <textarea 
                value={preferences.notes} 
                onChange={e => setPreferences({...preferences, notes: e.target.value})}
                placeholder="Any other specific requests or context for our clinical team..."
                className="w-full bg-white border border-[#E2D5B7] rounded-xl p-3 text-slate-900 focus:border-orange-500 outline-none min-h-[100px] resize-y"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3.5 rounded-xl bg-[#F9F5EC] text-slate-700 font-bold hover:bg-white transition-colors cursor-pointer border border-[#E2D5B7]"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={!isPreferencesComplete || isPending}
              className={`flex-1 font-black py-3.5 rounded-xl transition-all duration-300 ${
                isPreferencesComplete && !isPending
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 cursor-pointer hover:scale-[1.01]'
                  : 'bg-[#E2D5B7] text-[#8C826A] cursor-not-allowed'
              }`}
            >
              {isPending ? 'Saving...' : 'Submit Staffing Package'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
