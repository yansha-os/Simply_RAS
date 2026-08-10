'use client';

import React from 'react';
import { RbtDataCollectionEngine } from '@/components/emr/RbtDataCollectionEngine';

export default function SessionEmrPage() {
  return (
    <div className="max-w-5xl mx-auto py-6">
      <RbtDataCollectionEngine mode="LIVE_SESSION" />
    </div>
  );
}
