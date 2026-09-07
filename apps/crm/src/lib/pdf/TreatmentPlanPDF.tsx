import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  buildTreatmentPlanReportModel,
  NOT_DOCUMENTED,
  type ReportField,
  type ReportParagraph,
  type TreatmentPlanReportModel,
} from './treatmentPlanReportModel';

/**
 * Rise & Shine ABA — Comprehensive Treatment Plan PDF.
 * All content comes from buildTreatmentPlanReportModel (shared with the
 * ReportAssemblyTab preview) so the on-screen preview and the rendered PDF
 * never disagree. Missing clinical content prints as "Not yet documented".
 *
 * Keep byte-identical with the sibling app copy
 * (apps/crm and apps/hrm both ship src/lib/pdf/TreatmentPlanPDF.tsx).
 */

const TEAL = '#0d9488';
const INK = '#111827';
const MUTED = '#6b7280';
const FAINT = '#9ca3af';
const HAIRLINE = '#e5e7eb';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: INK,
    backgroundColor: '#ffffff',
  },

  // Fixed brand header (repeats on every page)
  brandBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: `2pt solid ${TEAL}`,
    paddingBottom: 8,
    marginBottom: 18,
  },
  brandName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    letterSpacing: 1.5,
  },
  brandTagline: {
    fontSize: 7.5,
    color: MUTED,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  brandDocType: {
    fontSize: 8,
    color: MUTED,
    textAlign: 'right',
  },

  // Cover block (first page only)
  coverTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  coverSubtitle: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 14,
  },
  coverPanel: {
    flexDirection: 'row',
    border: `1pt solid ${HAIRLINE}`,
    borderRadius: 6,
    marginBottom: 20,
  },
  coverColumn: {
    flex: 1,
    padding: 12,
  },
  coverDivider: {
    width: 1,
    backgroundColor: HAIRLINE,
  },
  coverColumnTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderBottom: `1pt solid ${HAIRLINE}`,
    paddingBottom: 3,
    marginBottom: 8,
  },

  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: 130,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
  },
  value: {
    flex: 1,
    fontSize: 9.5,
  },
  notDocumented: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Oblique',
    color: FAINT,
  },

  paragraphLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 2,
  },
  paragraphText: {
    fontSize: 9.5,
    lineHeight: 1.5,
    marginBottom: 8,
  },

  goalBox: {
    border: `1pt solid ${HAIRLINE}`,
    borderLeft: `2.5pt solid ${TEAL}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  goalTitle: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: INK,
    paddingRight: 8,
  },
  goalBadge: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  goalMetaItem: {
    fontSize: 8.5,
    color: '#374151',
    marginRight: 12,
    marginBottom: 2,
  },
  goalMetaKey: {
    fontFamily: 'Helvetica-Bold',
  },
  goalBody: {
    fontSize: 9,
    lineHeight: 1.45,
    marginTop: 2,
  },

  table: {
    border: `1pt solid ${HAIRLINE}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0fdfa',
    borderBottom: `1pt solid ${HAIRLINE}`,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: `0.5pt solid ${HAIRLINE}`,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  cellCode: {
    width: 58,
    padding: 6,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  cellLabel: {
    flex: 1,
    padding: 6,
    fontSize: 9,
  },
  cellHours: {
    width: 130,
    padding: 6,
    fontSize: 9,
    textAlign: 'right',
  },
  tableHeadText: {
    fontFamily: 'Helvetica-Bold',
    color: TEAL,
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  signatureCell: {
    width: '46%',
  },
  signatureScript: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 15,
    color: TEAL,
    marginBottom: 6,
    minHeight: 20,
  },
  signatureLine: {
    borderTop: `1pt solid ${INK}`,
    paddingTop: 5,
  },
  signatureLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  signatureMeta: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 48,
    right: 48,
    borderTop: `1pt solid ${HAIRLINE}`,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: FAINT,
  },
});

const FieldRows = ({ fields }: { fields: ReportField[] }) => (
  <View>
    {fields.map((field) => (
      <View style={styles.row} key={field.label}>
        <Text style={styles.label}>{field.label}</Text>
        {field.value ? (
          <Text style={styles.value}>{field.value}</Text>
        ) : (
          <Text style={styles.notDocumented}>{NOT_DOCUMENTED}</Text>
        )}
      </View>
    ))}
  </View>
);

const Paragraphs = ({ paragraphs }: { paragraphs: ReportParagraph[] }) => (
  <View>
    {paragraphs.map((p) => (
      <View key={p.label} wrap={false}>
        <Text style={styles.paragraphLabel}>{p.label}</Text>
        {p.text ? (
          <Text style={styles.paragraphText}>{p.text}</Text>
        ) : (
          <Text style={[styles.paragraphText, styles.notDocumented]}>{NOT_DOCUMENTED}</Text>
        )}
      </View>
    ))}
  </View>
);

const GoalMeta = ({ items }: { items: { key: string; value: string | null }[] }) => (
  <View style={styles.goalMetaRow}>
    {items.map((item) => (
      <Text style={styles.goalMetaItem} key={item.key}>
        <Text style={styles.goalMetaKey}>{item.key}: </Text>
        {item.value ?? NOT_DOCUMENTED}
      </Text>
    ))}
  </View>
);

const SectionEmpty = () => <Text style={styles.notDocumented}>{NOT_DOCUMENTED}</Text>;

const ReportBody = ({ model }: { model: TreatmentPlanReportModel }) => (
  <Page size="LETTER" style={styles.page} wrap>
    {/* Brand header — repeats on every page */}
    <View style={styles.brandBar} fixed>
      <View>
        <Text style={styles.brandName}>RISE &amp; SHINE ABA</Text>
        <Text style={styles.brandTagline}>APPLIED BEHAVIOR ANALYSIS SERVICES</Text>
      </View>
      <View>
        <Text style={styles.brandDocType}>Comprehensive Treatment Plan</Text>
        <Text style={styles.brandDocType}>{model.clientName}</Text>
      </View>
    </View>

    {/* Cover block */}
    <Text style={styles.coverTitle}>Comprehensive ABA Treatment Plan</Text>
    <Text style={styles.coverSubtitle}>
      Plan Period: {model.planPeriodLabel ?? NOT_DOCUMENTED}
      {'   ·   '}BCBA of Record: {model.bcbaOfRecord ?? NOT_DOCUMENTED}
    </Text>

    <View style={styles.coverPanel}>
      <View style={styles.coverColumn}>
        <Text style={styles.coverColumnTitle}>Client Demographics</Text>
        <FieldRows fields={model.demographics} />
      </View>
      <View style={styles.coverDivider} />
      <View style={styles.coverColumn}>
        <Text style={styles.coverColumnTitle}>Provider Information</Text>
        <FieldRows fields={model.provider} />
      </View>
    </View>

    {/* Background & History */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Background &amp; History</Text>
      <Paragraphs paragraphs={model.background} />
    </View>

    {/* Assessment Summary */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Assessment Summary</Text>
      <FieldRows fields={model.assessment.fields} />
      <View style={{ marginTop: 6 }} wrap={false}>
        <Text style={styles.paragraphLabel}>Standard Scores</Text>
        <FieldRows fields={model.assessment.toolScores} />
      </View>
      {model.assessment.observations.length > 0 ? (
        model.assessment.observations.map((obs) => (
          <View style={[styles.goalBox, { marginTop: 6 }]} key={obs.label} wrap={false}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{obs.label}</Text>
              <Text style={styles.goalBadge}>
                {[obs.date, obs.setting].filter(Boolean).join(' · ') || NOT_DOCUMENTED}
              </Text>
            </View>
            {obs.narrative ? (
              <Text style={styles.goalBody}>{obs.narrative}</Text>
            ) : (
              <Text style={styles.notDocumented}>{NOT_DOCUMENTED}</Text>
            )}
          </View>
        ))
      ) : (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.paragraphLabel}>Direct Observations</Text>
          <SectionEmpty />
        </View>
      )}
      <View style={{ marginTop: 8 }}>
        <Paragraphs paragraphs={model.assessment.narratives} />
      </View>
      <Text style={styles.paragraphLabel}>Domain-Specific Functioning</Text>
      {model.domainSummaries.map((domain) => (
        <View style={styles.goalBox} key={domain.label} wrap={false}>
          <View style={styles.goalHeader}>
            <Text style={styles.goalTitle}>{domain.label}</Text>
            <Text style={styles.goalBadge}>{domain.severity ?? 'Severity not rated'}</Text>
          </View>
          {domain.description ? (
            <Text style={styles.goalBody}>{domain.description}</Text>
          ) : (
            <Text style={styles.notDocumented}>{NOT_DOCUMENTED}</Text>
          )}
        </View>
      ))}
    </View>

    {/* Skill Acquisition Goals */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Skill Acquisition Goals</Text>
      {model.skillGoals.length > 0 ? (
        model.skillGoals.map((goal, index) => (
          <View style={styles.goalBox} key={index} wrap={false}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>
                {goal.domain ? `[${goal.domain}] ` : ''}
                {goal.description}
              </Text>
              {goal.status ? <Text style={styles.goalBadge}>{goal.status}</Text> : null}
            </View>
            <GoalMeta
              items={[
                { key: 'Baseline', value: goal.baseline },
                { key: 'Current Level', value: goal.currentLevel },
                { key: 'Mastery Criteria', value: goal.mastery },
                { key: 'Target Date', value: goal.targetDate },
              ]}
            />
          </View>
        ))
      ) : (
        <SectionEmpty />
      )}
    </View>

    {/* Behavior Reduction Plan */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Behavior Reduction Plan (BIP)</Text>
      {model.maladaptiveSummary ? (
        <View wrap={false}>
          <Text style={styles.paragraphLabel}>
            Maladaptive Behavior Summary
            {model.maladaptiveSummary.severity
              ? ` — Severity: ${model.maladaptiveSummary.severity}`
              : ''}
          </Text>
          {model.maladaptiveSummary.narrative ? (
            <Text style={styles.paragraphText}>{model.maladaptiveSummary.narrative}</Text>
          ) : (
            <Text style={[styles.paragraphText, styles.notDocumented]}>{NOT_DOCUMENTED}</Text>
          )}
        </View>
      ) : null}
      {model.behaviorGoals.length > 0 ? (
        model.behaviorGoals.map((behavior, index) => (
          <View style={styles.goalBox} key={index} wrap={false}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{behavior.behavior}</Text>
              <Text style={styles.goalBadge}>
                {[
                  behavior.status,
                  behavior.riskLevel ? `Risk: ${behavior.riskLevel}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <GoalMeta
              items={[
                { key: 'Function', value: behavior.hypothesizedFunction },
                { key: 'Baseline', value: behavior.baseline },
                { key: 'Mastery Criteria', value: behavior.mastery },
                { key: 'Target Date', value: behavior.targetDate },
              ]}
            />
            <Text style={styles.goalBody}>
              <Text style={styles.goalMetaKey}>Operational Definition: </Text>
              {behavior.definition ?? NOT_DOCUMENTED}
            </Text>
            <Text style={styles.goalBody}>
              <Text style={styles.goalMetaKey}>Replacement Behavior (FERB): </Text>
              {behavior.replacementBehavior ?? NOT_DOCUMENTED}
            </Text>
            <Text style={styles.goalBody}>
              <Text style={styles.goalMetaKey}>Proactive / Antecedent Strategies: </Text>
              {behavior.proactiveStrategies ?? NOT_DOCUMENTED}
            </Text>
            <Text style={styles.goalBody}>
              <Text style={styles.goalMetaKey}>Reactive / Consequence Strategies: </Text>
              {behavior.reactiveStrategies ?? NOT_DOCUMENTED}
            </Text>
          </View>
        ))
      ) : (
        <SectionEmpty />
      )}
    </View>

    {/* Caregiver Goals */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Caregiver Goals</Text>
      {model.caregiverGoals.length > 0 ? (
        model.caregiverGoals.map((goal, index) => (
          <View style={styles.goalBox} key={index} wrap={false}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{goal.description}</Text>
              {goal.status ? <Text style={styles.goalBadge}>{goal.status}</Text> : null}
            </View>
            <GoalMeta
              items={[
                { key: 'Baseline', value: goal.baseline },
                { key: 'Mastery Criteria', value: goal.mastery },
              ]}
            />
          </View>
        ))
      ) : (
        <SectionEmpty />
      )}
    </View>

    {/* Service Recommendation */}
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>Service Recommendation (CPT)</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.cellCode, styles.tableHeadText]}>CPT</Text>
          <Text style={[styles.cellLabel, styles.tableHeadText]}>Service</Text>
          <Text style={[styles.cellHours, styles.tableHeadText]}>Requested</Text>
        </View>
        {model.services.cptLines.map((line, index) => (
          <View
            style={
              index === model.services.cptLines.length - 1 ? styles.tableRowLast : styles.tableRow
            }
            key={`${line.code}-${line.label}`}
          >
            <Text style={styles.cellCode}>{line.code}</Text>
            <Text style={styles.cellLabel}>{line.label}</Text>
            {line.hours ? (
              <Text style={styles.cellHours}>
                {line.hours} {line.cadence}
              </Text>
            ) : (
              <Text style={[styles.cellHours, styles.notDocumented]}>{NOT_DOCUMENTED}</Text>
            )}
          </View>
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <FieldRows fields={model.services.fields} />
      </View>
    </View>

    {/* Medical Necessity & Care Coordination */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Medical Necessity &amp; Care Coordination</Text>
      <Paragraphs paragraphs={model.clinicalNarratives} />
      <Text style={styles.paragraphLabel}>Care Coordination Meetings</Text>
      {model.careCoordination.length > 0 ? (
        model.careCoordination.map((meeting, index) => (
          <View style={styles.goalBox} key={index} wrap={false}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle}>{meeting.provider ?? 'Provider'}</Text>
              {meeting.contactInfo ? (
                <Text style={styles.goalBadge}>{meeting.contactInfo}</Text>
              ) : null}
            </View>
            <Text style={styles.goalBody}>{meeting.notes ?? NOT_DOCUMENTED}</Text>
          </View>
        ))
      ) : (
        <SectionEmpty />
      )}
    </View>

    {/* Signatures */}
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>Signatures &amp; Consent</Text>
      <View style={styles.signatureRow}>
        <View style={styles.signatureCell}>
          <Text style={model.signatures.bcbaSignature ? styles.signatureScript : [styles.signatureScript, styles.notDocumented]}>
            {model.signatures.bcbaSignature ?? 'Pending signature'}
          </Text>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>
              {model.signatures.bcbaName
                ? `${model.signatures.bcbaName}, ${model.signatures.bcbaCredential}`
                : 'Board Certified Behavior Analyst'}
            </Text>
            <Text style={styles.signatureMeta}>
              Board Certified Behavior Analyst · Date:{' '}
              {model.signatures.bcbaSignedDate ?? NOT_DOCUMENTED}
            </Text>
          </View>
        </View>
        <View style={styles.signatureCell}>
          <Text style={model.signatures.parentSignature ? styles.signatureScript : [styles.signatureScript, styles.notDocumented]}>
            {model.signatures.parentSignature ?? 'Pending signature'}
          </Text>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Parent / Guardian Consent</Text>
            <Text style={styles.signatureMeta}>
              Date: {model.signatures.parentSignedDate ?? NOT_DOCUMENTED}
            </Text>
          </View>
        </View>
      </View>
    </View>

    {/* Footer — repeats on every page */}
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Rise &amp; Shine ABA LLC · CONFIDENTIAL — PHI</Text>
      <Text style={styles.footerText}>Generated {model.generatedAtLabel}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  </Page>
);

export const TreatmentPlanPDF = ({
  client,
  treatmentPlan,
}: {
  client: unknown;
  treatmentPlan: unknown;
}) => {
  const model = buildTreatmentPlanReportModel({ client, treatmentPlan });
  return (
    <Document
      title={`Treatment Plan — ${model.clientName}`}
      author="Rise & Shine ABA LLC"
      subject="Comprehensive ABA Treatment Plan"
    >
      <ReportBody model={model} />
    </Document>
  );
};
