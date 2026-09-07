'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { requestClientChanges } from '@/app/actions/intake';
import { RefreshCw, CheckCircle } from 'lucide-react';

export function RequestAccessButton({ magicLinkToken }: { magicLinkToken: string }) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [notes, setNotes] = useState('');
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!notes.trim()) {
      alert("Please provide a brief reason for requesting access.");
      return;
    }
    
    setLoading(true);
    const res = await requestClientChanges(magicLinkToken, notes);
    setLoading(false);
    
    if (res?.success) {
      setRequested(true);
      setIsRequesting(false);
    } else {
      alert("Failed to submit request.");
    }
  };

  if (requested) {
    return (
      <div className="mt-6 bg-[#FFF5ED] border border-[#FFD8C2] rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 shadow-xs">
        <CheckCircle className="text-[#EA580C] w-6 h-6" />
        <p className="text-[#EA580C] text-sm font-bold">Access Requested</p>
        <p className="text-slate-600 text-xs text-center">The administration team has been notified and will unlock your packet shortly.</p>
      </div>
    );
  }

  if (isRequesting) {
    return (
      <div className="mt-8 bg-white border border-[#E2D5B7] rounded-2xl p-4 text-left shadow-lg">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2 font-mono">Reason for Changes</label>
        <textarea 
          className="w-full bg-[#F9F5EC] border border-[#E2D5B7] rounded-xl p-3 text-slate-900 text-sm focus:border-orange-500 outline-none min-h-[100px] resize-y mb-4"
          placeholder="I forgot to upload my child's IEP..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 cursor-pointer" onClick={() => setIsRequesting(false)}>Cancel</Button>
          <Button variant="primary" className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold border-none cursor-pointer" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 flex justify-center">
      <Button 
        onClick={() => setIsRequesting(true)}
        variant="secondary"
        className="text-[#EA580C] border-[#EA580C]/40 hover:bg-[#FFF5ED] hover:text-orange-700 bg-white shadow-xs cursor-pointer"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Need to make changes? Request Access
      </Button>
    </div>
  );
}
