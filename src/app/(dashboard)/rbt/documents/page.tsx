import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FileText, ShieldCheck, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

export default function RbtDocumentsPage() {
  const documents = [
    { name: 'BACB RBT Credential Certificate', status: 'VERIFIED', expiry: '2027-05-15', category: 'Compliance' },
    { name: '40-Hour ABA Training Completion Form', status: 'VERIFIED', expiry: 'Permanent', category: 'Training' },
    { name: 'CPR & First Aid Certification Card', status: 'VERIFIED', expiry: '2026-11-30', category: 'Safety' },
    { name: 'HIPAA & PHI Security Acknowledgement', status: 'VERIFIED', expiry: '2027-01-10', category: 'Legal' },
    { name: 'NYS Background Clearance Check', status: 'VERIFIED', expiry: '2028-03-01', category: 'Compliance' },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-black-800 p-6 rounded-xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand-orange-500" />
            My Compliance &amp; Credential Documents Vault
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            BACB certificates, CPR cards, HIPAA clearance, and annual compliance files.
          </p>
        </div>

        <button className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white font-bold text-xs px-4 h-10 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md">
          <Upload className="w-4 h-4" /> Upload Updated Card
        </button>
      </div>

      {/* Document List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documents.map((doc, idx) => (
          <Card key={idx} className="border-white/10 bg-zinc-950 shadow-md">
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">{doc.name}</h3>
                  <span className="text-[10px] font-mono text-zinc-400 block">Category: {doc.category}</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {doc.status}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-400">
                <span>Expires: <strong className="text-white">{doc.expiry}</strong></span>
                <button className="text-brand-orange-400 hover:text-brand-orange-300 font-bold flex items-center gap-1 cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
