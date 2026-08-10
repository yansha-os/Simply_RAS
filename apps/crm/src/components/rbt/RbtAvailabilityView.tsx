'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { 
  Clock, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  Search, 
  Filter, 
  Briefcase, 
  Car, 
  Bus, 
  Sparkles, 
  Save, 
  Edit3, 
  ArrowRight, 
  UserCheck, 
  ShieldCheck, 
  Award,
  ChevronRight,
  X,
  Lock,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', 
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', 
  '6:00 PM', '7:00 PM', '8:00 PM'
];

interface ClientJobCase {
  id: string;
  caseCode: string;
  clientInitials: string;
  age: number;
  borough: string;
  neighborhood: string;
  distanceMiles: number;
  bcba: string;
  weeklyHours: number;
  scheduleText: string;
  matchScore: number;
  matchReason: string;
  transportationRequired: string;
  applied: boolean;
}

export function RbtAvailabilityView() {
  const [isAvailabilitySaved, setIsAvailabilitySaved] = useState(false);
  const [showGridEditor, setShowGridEditor] = useState(false);

  // Drag-to-Select Grid State (7 days x 13 hours boolean matrix)
  const [grid, setGrid] = useState<boolean[][]>(() => 
    Array.from({ length: 7 }, () => Array(13).fill(false))
  );

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [dragSelectingValue, setDragSelectingValue] = useState(true);

  // General Simple Inputs
  const [transportation, setTransportation] = useState<'CAR' | 'PUBLIC_TRANSIT' | 'WALKING'>('CAR');
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>(['Brooklyn', 'Queens']);
  const [maxDistance, setMaxDistance] = useState<number>(10);

  // Job Board Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistanceFilter, setSelectedDistanceFilter] = useState<number>(15);
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>('ALL');

  // Apply & Meet & Greet Modal
  const [selectedCaseForApply, setSelectedCaseForApply] = useState<ClientJobCase | null>(null);
  const [meetGreetDate, setMeetGreetDate] = useState('2026-08-12');
  const [meetGreetTime, setMeetGreetTime] = useState('04:00 PM');
  const [mounted, setMounted] = useState(false);

  // Sample Cases
  const [cases, setCases] = useState<ClientJobCase[]>([
    {
      id: 'case-1',
      caseCode: 'RAS-NY-104',
      clientInitials: 'L.M. (Leo)',
      age: 6,
      borough: 'Brooklyn',
      neighborhood: 'Park Slope',
      distanceMiles: 2.4,
      bcba: 'Dr. Sarah Jenkins, BCBA',
      weeklyHours: 12,
      scheduleText: 'Mon / Wed / Fri · 3:30 PM - 6:30 PM',
      matchScore: 98,
      matchReason: '🔥 98% Match: Fits your Tuesday/Thursday 3-7 PM Availability & Brooklyn Travel Radius!',
      transportationRequired: 'Public Transit or Car',
      applied: false
    },
    {
      id: 'case-2',
      caseCode: 'RAS-NY-108',
      clientInitials: 'M.R. (Maya)',
      age: 4,
      borough: 'Queens',
      neighborhood: 'Astoria',
      distanceMiles: 4.8,
      bcba: 'Marcus Vance, BCBA',
      weeklyHours: 15,
      scheduleText: 'Tue / Thu / Sat · 3:00 PM - 7:00 PM',
      matchScore: 95,
      matchReason: '🔥 95% Match: Fits Afternoon Grid & Queens Travel Preference!',
      transportationRequired: 'Car Preferred',
      applied: false
    },
    {
      id: 'case-3',
      caseCode: 'RAS-NY-112',
      clientInitials: 'L.M. (Lucas)',
      age: 8,
      borough: 'Manhattan',
      neighborhood: 'Upper West Side',
      distanceMiles: 6.2,
      bcba: 'Dr. Sarah Jenkins, BCBA',
      weeklyHours: 10,
      scheduleText: 'Mon / Wed · 4:00 PM - 7:00 PM',
      matchScore: 88,
      matchReason: '⚡ 88% Match: High billable rate client near subway line',
      transportationRequired: 'Public Transit (Subway A/C/1)',
      applied: false
    },
    {
      id: 'case-4',
      caseCode: 'RAS-NY-115',
      clientInitials: 'E.V. (Ethan)',
      age: 5,
      borough: 'Bronx',
      neighborhood: 'Riverdale',
      distanceMiles: 11.5,
      bcba: 'Dr. Amanda Chen, BCBA',
      weeklyHours: 20,
      scheduleText: 'Mon - Fri · 1:00 PM - 5:00 PM',
      matchScore: 82,
      matchReason: '⚡ 82% Match: Full-Time afternoon caseload opportunity',
      transportationRequired: 'Car Only',
      applied: false
    }
  ]);

  const [reqStatus, setReqStatus] = useState({
    tasksDone: false,
    interviewBooked: false,
    availabilitySet: false,
    simCompleted: false,
    isCleared: false
  });

  useEffect(() => {
    setMounted(true);
    const checkStatus = () => {
      const tasksDone = localStorage.getItem('ras_rbt_tasks_done') === 'true';
      const interviewBooked = localStorage.getItem('ras_rbt_interview_done') === 'true';
      const availabilitySet = localStorage.getItem('ras_rbt_availability_set') === 'true';
      const simCompleted = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const isCleared = localStorage.getItem('ras_rbt_cleared') === 'true';

      setReqStatus({ tasksDone, interviewBooked, availabilitySet, simCompleted, isCleared });

      if (availabilitySet) {
        setIsAvailabilitySaved(true);
      } else {
        const defaultGrid = Array.from({ length: 7 }, (_, dIndex) => 
          Array.from({ length: 13 }, (_, hIndex) => (dIndex < 5 && hIndex >= 4 && hIndex <= 10))
        );
        setGrid(defaultGrid);
      }
    };

    checkStatus();
    window.addEventListener('rbt_sim_changed', checkStatus);
    window.addEventListener('simulationCompleted', checkStatus);
    window.addEventListener('rbt_clearance_changed', checkStatus);
    window.addEventListener('rbt_tasks_changed', checkStatus);
    window.addEventListener('rbt_availability_changed', checkStatus);
    return () => {
      window.removeEventListener('rbt_sim_changed', checkStatus);
      window.removeEventListener('simulationCompleted', checkStatus);
      window.removeEventListener('rbt_clearance_changed', checkStatus);
    };
  }, []);

  const isJobBoardUnlocked = reqStatus.isCleared || (reqStatus.tasksDone && reqStatus.interviewBooked);

  // DRAG-TO-SELECT GRID HANDLERS
  const handleCellMouseDown = (dayIndex: number, hourIndex: number) => {
    setIsMouseDown(true);
    const newValue = !grid[dayIndex][hourIndex];
    setDragSelectingValue(newValue);

    setGrid(prev => {
      const copy = prev.map(row => [...row]);
      copy[dayIndex][hourIndex] = newValue;
      return copy;
    });
  };

  const handleCellMouseEnter = (dayIndex: number, hourIndex: number) => {
    if (isMouseDown) {
      setGrid(prev => {
        const copy = prev.map(row => [...row]);
        copy[dayIndex][hourIndex] = dragSelectingValue;
        return copy;
      });
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const presetAfternoons = () => {
    setGrid(Array.from({ length: 7 }, (_, dIndex) => 
      Array.from({ length: 13 }, (_, hIndex) => (dIndex < 5 && hIndex >= 4 && hIndex <= 10))
    ));
    toast.success('Selected Mon-Fri 12 PM - 7 PM availability window!');
  };

  const presetClearAll = () => {
    setGrid(Array.from({ length: 7 }, () => Array(13).fill(false)));
    toast.info('Cleared availability grid.');
  };

  const toggleBorough = (b: string) => {
    setSelectedBoroughs(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  };

  const handleSaveAvailabilityGrid = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('ras_rbt_availability_set', 'true');
    localStorage.setItem('ras_rbt_boroughs', JSON.stringify(selectedBoroughs));
    localStorage.setItem('ras_rbt_transportation', transportation);
    window.dispatchEvent(new Event('rbt_availability_changed'));

    setIsAvailabilitySaved(true);
    setShowGridEditor(false);
    toast.success('🎉 Weekly Availability Grid Saved! Client Job Board Unlocked!');
  };

  const handleOpenApplyModal = (clientCase: ClientJobCase) => {
    setSelectedCaseForApply(clientCase);
  };

  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseForApply) return;

    setCases(prev => prev.map(c => c.id === selectedCaseForApply.id ? { ...c, applied: true } : c));
    toast.success(`🎉 Application & Family Meet & Greet Requested for ${selectedCaseForApply.clientInitials} on ${meetGreetDate} at ${meetGreetTime}!`);
    setSelectedCaseForApply(null);
  };

  // Filter cases
  const filteredCases = cases.filter(c => {
    const matchesSearch = c.clientInitials.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.neighborhood.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.borough.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDistance = c.distanceMiles <= selectedDistanceFilter;
    return matchesSearch && matchesDistance;
  });

  if (!mounted) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center select-none font-black text-slate-400 animate-pulse">
        Checking Onboarding Clearance Status...
      </div>
    );
  }

  if (!isJobBoardUnlocked) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 text-center select-none space-y-6 animate-fade-in">
        <div className="bg-white border-4 border-orange-200 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-amber-100 border-2 border-amber-300 text-amber-700 flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-10 h-10 text-[#F97316]" />
          </div>

          <div className="space-y-2">
            <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-mono font-black px-3.5 py-1 rounded-full uppercase tracking-wider">
              🔒 ONBOARDING REQUIREMENTS PENDING
            </span>
            <h2 className="text-2xl font-black font-heading text-slate-900 tracking-tight">
              Client Job Board &amp; Work Availability Locked
            </h2>
            <p className="text-xs text-slate-600 font-semibold max-w-lg mx-auto leading-relaxed">
              You must complete your required onboarding tasks (electronic signatures &amp; forms) on your <strong>My Tasks page</strong> before setting your availability grid or applying for client cases.
            </p>
          </div>

          {/* DYNAMIC REQUIREMENTS CHECKLIST */}
          <div className="p-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-left space-y-3 max-w-lg mx-auto">
            <h4 className="text-xs font-black text-slate-900 font-heading uppercase tracking-wider border-b border-slate-200 pb-2">
              📋 Your Onboarding Requirement Status:
            </h4>
            <div className="space-y-2 text-xs font-extrabold">
              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.tasksDone ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.tasksDone ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 1: E-Signatures &amp; Forms (Required for Job Board)
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.tasksDone ? '✓ COMPLETED' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.interviewBooked ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.interviewBooked ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 2: HR Interview Slot
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.interviewBooked ? '✓ SCHEDULED' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.availabilitySet ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.availabilitySet ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 3: Work Availability Grid
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.availabilitySet ? '✓ CONFIGURATION DONE' : '❌ PENDING'}</span>
              </div>

              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${reqStatus.simCompleted ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                <span className="flex items-center gap-2">
                  {reqStatus.simCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-rose-500" />}
                  REQ 4: Data Simulation Tutorial
                </span>
                <span className="text-[10px] font-mono font-black">{reqStatus.simCompleted ? '✓ SIMULATION PASSED' : '❌ UNRESOLVED'}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              href="/rbt"
              className="inline-flex items-center justify-center gap-2 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-6 py-4 rounded-2xl shadow-xl transition-all cursor-pointer"
            >
              <ClipboardList className="w-4.5 h-4.5" />
              <span>Go to My Tasks to Complete REQ 1 Forms →</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="max-w-5xl mx-auto space-y-8 pb-12 text-slate-900 select-none"
      onMouseUp={handleMouseUp}
    >
      {/* HEADER BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F0F7FF] border-2 border-[#BFDBFE] p-6 rounded-3xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F97316] text-white flex items-center justify-center font-bold shadow-md shrink-0">
            {isAvailabilitySaved && !showGridEditor ? <Briefcase className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight">
                {isAvailabilitySaved && !showGridEditor 
                  ? 'Rise & Shine ABA Client Job Board & Case Matching' 
                  : 'Set Your Weekly Work Availability Calendar Grid'}
              </h1>
              {isAvailabilitySaved && (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> AVAILABILITY CONFIGURED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              {isAvailabilitySaved && !showGridEditor
                ? 'Browse AI-recommended client cases matched to your schedule, location distance, and travel preferences.'
                : 'Click and drag across calendar grid cells to highlight your available therapy hours (Mon - Sun).'}
            </p>
          </div>
        </div>

        {isAvailabilitySaved && !showGridEditor && (
          <button
            onClick={() => setShowGridEditor(true)}
            className="bg-white border-2 border-orange-300 text-[#F97316] hover:bg-orange-50 font-black text-xs px-5 py-3 rounded-2xl shadow-md flex items-center gap-2 cursor-pointer transition-all shrink-0"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit My Availability Grid</span>
          </button>
        )}
      </div>

      {/* VIEW 1: DRAG-TO-SELECT AVAILABILITY GRID (IF NOT SAVED OR EDITING) */}
      {(!isAvailabilitySaved || showGridEditor) && (
        <form onSubmit={handleSaveAvailabilityGrid} className="space-y-8 animate-fade-in">
          {/* INTERACTIVE CALENDAR GRID */}
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 font-heading flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#F97316]" /> Click &amp; Drag Hourly Availability Grid
                </h3>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  Click and drag your mouse across cells to highlight available time slots in green.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={presetAfternoons}
                  className="px-3 py-1.5 rounded-xl border border-orange-300 bg-orange-50 text-[#F97316] font-bold text-xs hover:bg-orange-100 cursor-pointer"
                >
                  Mon-Fri 12-7pm
                </button>
                <button
                  type="button"
                  onClick={presetClearAll}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-600 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                >
                  Clear Grid
                </button>
              </div>
            </div>

            {/* GRID TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center select-none">
                <thead>
                  <tr>
                    <th className="p-2 border border-slate-200 bg-slate-100 text-xs font-mono font-bold text-slate-600 w-24">
                      Time Slot
                    </th>
                    {DAYS.map((day) => (
                      <th key={day} className="p-2.5 border border-slate-200 bg-[#F0F7FF] text-xs font-heading font-black text-slate-900">
                        {day.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hourText, hIndex) => (
                    <tr key={hourText}>
                      <td className="p-2 border border-slate-200 bg-slate-50 text-[11px] font-mono font-bold text-slate-600">
                        {hourText}
                      </td>
                      {DAYS.map((_, dIndex) => {
                        const isSelected = grid[dIndex][hIndex];
                        return (
                          <td
                            key={`${dIndex}-${hIndex}`}
                            onMouseDown={() => handleCellMouseDown(dIndex, hIndex)}
                            onMouseEnter={() => handleCellMouseEnter(dIndex, hIndex)}
                            className={`p-3 border border-slate-200 cursor-pointer transition-all duration-150 text-[10px] font-bold ${
                              isSelected 
                                ? 'bg-emerald-500 text-white font-black shadow-inner scale-[0.98]' 
                                : 'bg-white hover:bg-orange-50 text-transparent'
                            }`}
                          >
                            {isSelected ? '✓ OPEN' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500 font-semibold italic text-center">
              💡 Tip: Click any cell and hold to drag across multiple days or times.
            </p>
          </div>

          {/* SIMPLE INPUTS: TRANSPORTATION & BOROUGH RADIUS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* TRANSPORTATION & TRAVEL RADIUS */}
            <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xl">
              <div className="border-b border-orange-100 pb-3">
                <h3 className="text-base font-black text-slate-900 font-heading flex items-center gap-2">
                  <Car className="w-5 h-5 text-purple-600" /> Transportation &amp; Distance Radius
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Primary Mode of Transportation:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'CAR', label: 'Personal Car', icon: Car },
                      { id: 'PUBLIC_TRANSIT', label: 'Public Transit', icon: Bus },
                      { id: 'WALKING', label: 'Walking/Bike', icon: MapPin }
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = transportation === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTransportation(item.id as any)}
                          className={`p-3 rounded-2xl border-2 text-xs font-extrabold flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                            active 
                              ? 'bg-purple-600 text-white border-purple-600 shadow-md' 
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-purple-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs font-bold mb-1">
                    <span className="text-slate-700">Max Travel Distance:</span>
                    <strong className="text-purple-700 font-black">{maxDistance} Miles Radius</strong>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="25"
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(Number(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* PREFERRED BOROUGHS */}
            <div className="bg-white border-2 border-orange-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xl">
              <div className="border-b border-orange-100 pb-3">
                <h3 className="text-base font-black text-slate-900 font-heading flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#F97316]" /> Preferred NYC Boroughs
                </h3>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                {['Brooklyn', 'Queens', 'Manhattan', 'Bronx', 'Staten Island'].map((b) => {
                  const active = selectedBoroughs.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBorough(b)}
                      className={`px-4 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                        active 
                          ? 'bg-[#F97316] text-white shadow-md' 
                          : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-orange-50'
                      }`}
                    >
                      {active ? `✓ ${b}` : `+ ${b}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-sm px-8 py-4 rounded-2xl shadow-xl flex items-center gap-2 cursor-pointer transition-all"
            >
              <Save className="w-5 h-5" />
              <span>Save Grid &amp; Open Client Job Board →</span>
            </button>
          </div>
        </form>
      )}

      {/* VIEW 2: INDEED-STYLE CLIENT JOB BOARD & MATCHING */}
      {isAvailabilitySaved && !showGridEditor && (
        <div className="space-y-6 animate-fade-in">
          {/* SEARCH & INDEED FILTERS BAR */}
          <div className="bg-white border-2 border-orange-200 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                <input
                  type="text"
                  placeholder="Search by neighborhood, client initials, or BCBA..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-4 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#F97316]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-50 border-2 border-slate-200 px-3 py-2 rounded-2xl text-xs font-bold text-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-purple-600" />
                  <span>Max Distance:</span>
                  <select
                    value={selectedDistanceFilter}
                    onChange={(e) => setSelectedDistanceFilter(Number(e.target.value))}
                    className="bg-transparent font-black text-purple-700 outline-none cursor-pointer"
                  >
                    <option value={5}>Within 5 Miles</option>
                    <option value={10}>Within 10 Miles</option>
                    <option value={15}>Within 15 Miles</option>
                    <option value={25}>Within 25 Miles</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* LIST OF CLIENT JOB CASES */}
          <div className="space-y-4">
            {filteredCases.length === 0 ? (
              <div className="bg-white border-2 border-slate-200 rounded-3xl p-10 text-center space-y-2">
                <p className="text-sm font-bold text-slate-600">No client cases match your search filters.</p>
                <button
                  onClick={() => { setSearchQuery(''); setSelectedDistanceFilter(25); }}
                  className="text-xs font-bold text-[#F97316] underline cursor-pointer"
                >
                  Clear search filters
                </button>
              </div>
            ) : (
              filteredCases.map((c) => (
                <div 
                  key={c.id}
                  className="bg-white border-2 border-orange-200 rounded-3xl p-6 shadow-xl space-y-4 hover:border-orange-400 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-orange-100 border border-orange-300 text-[#F97316] font-black flex items-center justify-center text-sm shadow-sm">
                        {c.clientInitials.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-slate-900 font-heading">
                            Client Case #{c.caseCode} — {c.clientInitials} (Age {c.age})
                          </h3>
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full">
                            {c.matchScore}% AI MATCH
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-bold flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-purple-700"><MapPin className="w-3.5 h-3.5" /> {c.neighborhood}, {c.borough} ({c.distanceMiles} mi)</span>
                          <span className="flex items-center gap-1 text-blue-700"><UserCheck className="w-3.5 h-3.5" /> {c.bcba}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-[#F97316] font-mono block">{c.weeklyHours} Hours / Week</span>
                      <span className="text-[10px] font-bold text-slate-500">{c.scheduleText}</span>
                    </div>
                  </div>

                  {/* AI REASON BADGE */}
                  <div className="bg-orange-50/80 border border-orange-200 p-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-orange-900 font-semibold">
                      <Sparkles className="w-4 h-4 text-[#F97316] shrink-0" />
                      {c.matchReason}
                    </span>

                    {c.applied ? (
                      <span className="bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-xl flex items-center gap-1 shadow-sm shrink-0">
                        <CheckCircle2 className="w-4 h-4" /> Meet &amp; Greet Scheduled
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOpenApplyModal(c)}
                        className="bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                      >
                        <span>Apply &amp; Schedule Meet &amp; Greet</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MEET & GREET APPLICATION MODAL PORTAL TO BODY */}
      {mounted && selectedCaseForApply && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#F97316] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-[0_10px_50px_rgba(249,115,22,0.4)] text-slate-900 animate-fade-in relative z-[1000000]">
            <div className="flex items-center justify-between border-b border-orange-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-base font-black font-heading text-slate-900">
                  Schedule Family Meet &amp; Greet
                </h3>
              </div>
              <button 
                onClick={() => setSelectedCaseForApply(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-orange-50 border border-orange-200 p-3 rounded-2xl text-xs space-y-1 text-slate-800">
              <p className="font-extrabold text-slate-900">
                Applying for Case #{selectedCaseForApply.caseCode} ({selectedCaseForApply.clientInitials})
              </p>
              <p className="text-[11px] text-slate-600 font-medium">
                {selectedCaseForApply.neighborhood}, {selectedCaseForApply.borough} · {selectedCaseForApply.weeklyHours} hrs/week
              </p>
            </div>

            <form onSubmit={handleSubmitApplication} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Interview Date:</label>
                <input
                  type="date"
                  value={meetGreetDate}
                  onChange={(e) => setMeetGreetDate(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Interview Time Slot:</label>
                <select
                  value={meetGreetTime}
                  onChange={(e) => setMeetGreetTime(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900"
                >
                  <option value="10:00 AM">10:00 AM - 10:30 AM</option>
                  <option value="02:00 PM">02:00 PM - 02:30 PM</option>
                  <option value="04:00 PM">04:00 PM - 04:30 PM</option>
                  <option value="06:00 PM">06:00 PM - 06:30 PM</option>
                </select>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCaseForApply(null)}
                  className="w-1/3 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  className="w-2/3 bg-[#F97316] hover:bg-orange-600 text-white font-black text-xs py-3 rounded-xl shadow-lg cursor-pointer"
                >
                  Confirm &amp; Submit Application
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
