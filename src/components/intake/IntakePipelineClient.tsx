'use client';

import React, { useState, useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createInquiry, approveDocument } from '@/app/(dashboard)/portal-case/actions';
import { User, FileCheck, ShieldAlert, Activity } from 'lucide-react';

const createInitialState = { error: '', success: false };
const authInitialState = { error: '', success: false };
const txAuthInitialState = { error: '', success: false };

export default function IntakePipelineClient({ inquiries, pendingAuths, expiringAuths, pendingTreatmentAuths = [] }: any) {
  const [createState, createAction, isCreating] = useActionState<any, FormData>(createInquiry, createInitialState);

  return (
    <div className="grid gap-6 md:grid-cols-4 mt-8">
      {/* COLUMN 1: INQUIRIES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">1. Intake</h2>
          <Badge variant="secondary">{inquiries.length}</Badge>
        </div>
        
        {/* New Inquiry Form */}
        <Card className="border-brand-gold-500/50 shadow-sm bg-slate-50/30 dark:bg-brand-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Log New Inquiry</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAction} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input name="firstName" placeholder="First Name" required className="h-8 text-xs" />
                <Input name="lastName" placeholder="Last Name" required className="h-8 text-xs" />
              </div>
              <Input name="guardianEmail" type="email" placeholder="Guardian Email" className="h-8 text-xs" />
              <Button type="submit" size="sm" className="w-full h-8 text-xs" isLoading={isCreating}>Add Inquiry</Button>
            </form>
          </CardContent>
        </Card>

        {inquiries.map((client: any) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{client.firstName} {client.lastName}</p>
                </div>
                <Badge variant="warning">Inquiry</Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2">
                <FileCheck className="w-3 h-3" /> Mark Verified
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* COLUMN 2: ASSESSMENT PA REQUESTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">2. Assess PA</h2>
          <Badge variant="secondary">{pendingAuths.length}</Badge>
        </div>

        {pendingAuths.map((client: any) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow border-blue-200 dark:border-blue-900">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{client.firstName} {client.lastName}</p>
                </div>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">97151</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* COLUMN 3: TREATMENT PA REQUESTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">3. Treatment PA</h2>
          <Badge variant="secondary">{pendingTreatmentAuths?.length || 0}</Badge>
        </div>

        {pendingTreatmentAuths?.map((auth: any) => (
          <Card key={auth.id} className="hover:shadow-md transition-shadow border-purple-200 dark:border-purple-900">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{auth.client.firstName} {auth.client.lastName}</p>
                  <p className="text-xs text-slate-500">Plan Submitted</p>
                </div>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700">Tx PA</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* COLUMN 4: REAUTH ALERTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-heading">4. Reauth</h2>
          <Badge variant="danger">{expiringAuths.length}</Badge>
        </div>

        {expiringAuths.map((auth: any) => (
          <Card key={auth.id} className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{auth.client.firstName}</p>
                </div>
                <Badge variant="danger">T-45</Badge>
              </div>
              <div className="text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/30 p-2 rounded-md">
                Exp: {new Date(auth.endDate).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
