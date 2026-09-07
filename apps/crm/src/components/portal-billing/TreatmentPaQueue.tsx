'use client';



/**

 * Treatment PA manual Plutus tracker queue.

 * Status mutations: `@/app/(dashboard)/portal-case/actions/billing.ts` (canonical),

 * surfaced inline via `portal-billing/actions.ts` wrappers (see PaQueueShared).

 * No EDI / payer API — submitted / approved / denied + auth numbers only.

 */



import React from 'react';

import { Clock, FilePlus, RefreshCw, ShieldCheck } from 'lucide-react';

import {

  EmptyColumn,

  PaQueueCard,

  QueueBoard,

  QueueLane,

  QueueSearchInput,

  filterClientsByQuery,

  getPa,

  type PaQueueClient,

} from './PaQueueShared';

import {

  daysUntilPaDate,

  isTreatmentExpiring,

  isTreatmentInFlight,

  isTreatmentReadyToSubmit,

} from '@/lib/billingPaQueueMetrics';



function treatmentPa(client: PaQueueClient) {

  return getPa(client, 'TREATMENT');

}



export default function TreatmentPaQueue({ clients }: { clients: PaQueueClient[] }) {

  const [query, setQuery] = React.useState('');

  const visible = filterClientsByQuery(clients, query);



  const pendingTxPaQueue = visible.filter(isTreatmentReadyToSubmit);

  const submittedQueue = visible.filter(isTreatmentInFlight);

  const expiringQueue = visible.filter(isTreatmentExpiring);



  const noResults =

    query.trim() !== '' &&

    pendingTxPaQueue.length + submittedQueue.length + expiringQueue.length === 0;



  return (

    <div className="space-y-3 pb-2">

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

        <QueueSearchInput

          value={query}

          onChange={setQuery}

          placeholder="Search clients by name…"

        />

        <div className="flex flex-wrap gap-2">

          {[

            {

              label: 'Submit',

              count: pendingTxPaQueue.length,

              cls: 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20',

            },

            {

              label: 'Tracking',

              count: submittedQueue.length,

              cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20',

            },

            {

              label: 'Re-auth',

              count: expiringQueue.length,

              cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20',

            },

          ].map((stat) => (

            <div

              key={stat.label}

              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs font-bold ${stat.cls}`}

            >

              <ShieldCheck className="h-3.5 w-3.5" />

              {stat.label}

              <span className="opacity-80">{stat.count}</span>

            </div>

          ))}

        </div>

      </div>



      {noResults && (

        <EmptyColumn message={`No treatment-phase clients match “${query.trim()}”.`} />

      )}



      {!noResults && (

        <QueueBoard

          columns={[

            <QueueLane

              key="submit"

              eyebrow="Column 01"

              title="Submit Treatment PA"

              count={pendingTxPaQueue.length}

              icon={FilePlus}

              accentClass="text-brand-orange-400"

              borderClass="border-brand-orange-500/30"

            >

              {pendingTxPaQueue.length === 0 ? (

                <EmptyColumn message="No clients ready for Treatment PA submission (needs REPORT_ASSEMBLED + parent signature)." />

              ) : (

                pendingTxPaQueue.map((c) => (

                  <PaQueueCard

                    key={c.id}

                    client={c}

                    kind="TREATMENT"

                    icon={FilePlus}

                    accent="orange"

                    desc="Ready to submit 97153, 97155, 97156 to insurer."

                  />

                ))

              )}

            </QueueLane>,

            <QueueLane

              key="tracking"

              eyebrow="Column 02"

              title="PA Tracking"

              count={submittedQueue.length}

              icon={Clock}

              accentClass="text-sky-400"

              borderClass="border-sky-500/30"

            >

              {submittedQueue.length === 0 ? (

                <EmptyColumn message="No Treatment PAs awaiting payer decision or denial follow-up." />

              ) : (

                submittedQueue.map((c) => {

                  const pa = treatmentPa(c);

                  const desc = pa?.status?.startsWith('DENIED')

                    ? 'Denial logged — resolve and re-decision inline or in the Billing tab.'

                    : 'Awaiting payer decision on treatment authorization.';

                  return (

                    <PaQueueCard

                      key={c.id}

                      client={c}

                      kind="TREATMENT"

                      icon={Clock}

                      accent="sky"

                      desc={desc}

                    />

                  );

                })

              )}

            </QueueLane>,

            <QueueLane

              key="reauth"

              eyebrow="Column 03"

              title="Re-Authorization Needed"

              count={expiringQueue.length}

              icon={RefreshCw}

              accentClass="text-rose-400"

              borderClass="border-rose-500/30"

            >

              {expiringQueue.length === 0 ? (

                <EmptyColumn message="No approved Treatment auths expiring within 45 days." />

              ) : (

                expiringQueue.map((c) => {

                  const pa = treatmentPa(c);

                  const days = daysUntilPaDate(pa?.expirationDate);

                  return (

                    <PaQueueCard

                      key={c.id}

                      client={c}

                      kind="TREATMENT"

                      icon={RefreshCw}

                      accent="rose"

                      desc={

                        days === null

                          ? 'Re-authorization window.'

                          : days < 0

                            ? `Auth expired ${Math.abs(days)} days ago.`

                            : `Expires in ${days} days — start re-auth.`

                      }

                    />

                  );

                })

              )}

            </QueueLane>,

          ]}

        />

      )}

    </div>

  );

}
