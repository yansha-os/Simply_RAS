'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image, { type ImageLoaderProps } from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useHrmRole } from '@/lib/useHrmRole';
import { AtsApplicantAuditView } from '@/components/hrm/AtsApplicantAuditView';
import { ExtendOfferTab } from '@/components/hrm/ExtendOfferTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  ArrowLeft, 
  CheckCircle2, 
  ShieldCheck, 
  Award, 
  Video, 
  Clock, 
  MapPin, 
  Key, 
  Mail, 
  Phone, 
  UserCheck, 
  Check, 
  Copy,
  ClipboardList,
  FileText,
  StickyNote,
  XCircle,
  Save,
  CheckSquare,
  Download,
  Eye,
  Paperclip,
  User,
  AlertTriangle,
  Trash2,
  AlertOctagon,
  ChevronRight,
  HelpCircle,
  X,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAtsCandidates,
  deleteAtsCandidate,
  inviteCandidate,
  getActiveCandidateMagicLink,
  resetCandidateDeviceLock,
  updateCandidateProgress,
  getOnboardingProgress,
  getHiredCandidateSummary,
  type HiredCandidateSummary,
} from '@/app/actions/atsActions';
import { getCandidateDocuments } from '@/app/actions/candidateDocumentActions';
import {
  getAtsInterview,
  saveInterviewNotes,
  saveInterviewScorecard,
  saveInterviewScriptProgress,
  markHrJoinedInterview,
  releaseAtsInterviewClaim,
  completeAtsInterview,
} from '@/app/actions/hrInterviewActions';
import type { AtsCandidateData } from '@/lib/atsStage';
import { saveRecordingBlob, getRecordingsFromIDB, deleteRecordingFromIDB } from '@/lib/recordingsDb';

type ApplicantProfileTab =
  | 'OVERVIEW'
  | 'PROGRESS'
  | 'INTERVIEW'
  | 'EXTEND_OFFER'
  | 'AUDIT';

type ApplicantProfileNavigationTab = {
  id: ApplicantProfileTab;
  label: string;
  icon: typeof User;
  badge?: string;
};

type WebKitAudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

type ScorecardCategoryKey = 'communication' | 'adaptability' | 'professionalism' |
  'empathy' | 'abaBasics' | 'documentation' | 'reliability' | 'availabilityFit';
type InterviewScorecard = Record<ScorecardCategoryKey, { score: number | null; comment: string }>;

function uploadedDocumentImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

export default function ApplicantProfilePage() {
  const { role } = useHrmRole();
  const params = useParams();
  const router = useRouter();
  const applicantId = (params?.id as string) || '';

  const [applicant, setApplicant] = useState<AtsCandidateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<ApplicantProfileTab>('OVERVIEW');
  // Candidate Notes & Script Dossier State
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'NOTES' | 'SCORECARD' | 'CANDIDATE_INFO' | 'RECORDING'>('NOTES');
  const [hasJoinedMeeting, setHasJoinedMeeting] = useState(false);
  const [candidateCityZip, setCandidateCityZip] = useState('Bronx, NY 10451');
  const [candidateAvailabilityNotes, setCandidateAvailabilityNotes] = useState('Mon-Fri 3pm-8pm');
  const [syncRbtProfileOnSave, setSyncRbtProfileOnSave] = useState(true);
  const [scorecardCategories, setScorecardCategories] = useState<InterviewScorecard>({
    communication: { score: null, comment: '' },
    adaptability: { score: null, comment: '' },
    professionalism: { score: null, comment: '' },
    empathy: { score: null, comment: '' },
    abaBasics: { score: null, comment: '' },
    documentation: { score: null, comment: '' },
    reliability: { score: null, comment: '' },
    availabilityFit: { score: null, comment: '' },
  });
  const [isScorecardDirty, setIsScorecardDirty] = useState(false);
  const [isSavingScorecard, setIsSavingScorecard] = useState(false);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const scorecardRevisionRef = React.useRef(0);
  const [recommendationDecision, setRecommendationDecision] = useState<'RECOMMEND_HIRE' | 'REJECT' | 'NO_OPINION' | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [recommendationChoice, setRecommendationChoice] = useState<'RECOMMEND_HIRE' | 'REJECT' | 'NO_OPINION'>('RECOMMEND_HIRE');
  const [recommendationExplanation, setRecommendationExplanation] = useState('');
  const [isInterviewClaimed, setIsInterviewClaimed] = useState(false);
  const [isReleasingInterview, setIsReleasingInterview] = useState(false);
  const [completedScriptSteps, setCompletedScriptSteps] = useState<number[]>([]);

  // In-Browser Video Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedVideos, setRecordedVideos] = useState<{ id: string; title: string; url: string; duration: number; timestamp: string }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Submitted Application Form Data State
  const [submittedApp, setSubmittedApp] = useState<{
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    address?: string;
    gender?: string;
    rbtStatus?: string;
    cprStatus?: string;
    yearsExperience?: string;
    languages?: string;
    boroughs?: string;
    weeklyHours?: string;
    availableToStart?: string;
    workAuth?: string;
    backgroundCheck?: string;
    transportation?: string;
    availability?: string;
    additionalNotes?: string;
    fortyHourCertFileName?: string;
    resumeFileName?: string;
    resumeFileDataUrl?: string;
    govtIdFileName?: string;
    govtIdFileDataUrl?: string;
    submittedAt?: string;
  } | null>(null);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<{ name: string; type: 'RESUME' | 'GOVT_ID' } | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingDeviceLock, setIsResettingDeviceLock] = useState(false);
  const [isCopyingMagicLink, setIsCopyingMagicLink] = useState(false);

  const handleResetDeviceLock = async () => {
    setIsResettingDeviceLock(true);
    try {
      const result = await resetCandidateDeviceLock(applicantId);
      if (!result.success) {
        toast.error(result.error || 'Device access reset failed.');
        return;
      }
      toast.success(
        `Device access reset. ${result.revokedSessions} active session${result.revokedSessions === 1 ? '' : 's'} revoked; the next valid-link visit can re-bind.`
      );
    } catch {
      toast.error('Device access reset failed. Please try again.');
    } finally {
      setIsResettingDeviceLock(false);
    }
  };

  const handleDeleteApplicant = async () => {
    if (deleteConfirmationText.trim() !== 'DELETE') {
      toast.error('You must type "DELETE" exactly to confirm candidate removal.');
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteAtsCandidate(applicantId);
      if (!result.success) {
        toast.error(result.error || 'Applicant deletion failed.');
        return;
      }

      // Clear client-only display state only after the server confirms deletion.
      const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
      delete customStages[applicantId];
      localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
      localStorage.removeItem(`ras_applicant_notes_${applicantId}`);
      localStorage.removeItem(`ras_submitted_app_${applicantId}`);

      // Track deleted applicant IDs so fallbacks are excluded
      const deletedIds = JSON.parse(localStorage.getItem('ras_deleted_applicants') || '[]');
      if (!deletedIds.includes(applicantId)) {
        deletedIds.push(applicantId);
        localStorage.setItem('ras_deleted_applicants', JSON.stringify(deletedIds));
      }

      window.dispatchEvent(new Event('storage'));
      toast.success(`Applicant ${applicant?.name || ''} has been permanently deleted.`);
      setShowDeleteModal(false);
      setTimeout(() => {
        router.push('/ats');
      }, 300);
    } catch {
      toast.error('Applicant deletion failed. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Scheduled Interview Payload
  const [interviewPayload, setInterviewPayload] = useState<{
    candidateName?: string;
    candidateEmail?: string;
    candidateId?: string;
    hrInterviewer?: string;
    date?: string;
    time?: string;
    meetingCode?: string;
    meetingLink?: string;
    status?: string;
    bookedAt?: string;
  } | null>(null);

  // Requirements checklist state (real-time from RBT candidate portal)
  const [requirements, setRequirements] = useState({
    tasksDone: false,
    certUploaded: false,
    simulationPassed: false,
    availabilitySet: false,
    interviewBooked: false,
    interviewPassed: false,
    backgroundCleared: false,
  });

  // HIRED linkage: real RBT user account + case-opening claim state
  const [hiredSummary, setHiredSummary] = useState<HiredCandidateSummary | null>(null);

  // The five OFFER-gating requirements — must mirror deriveAtsStage (lib/atsStage.ts)
  // and the pipeline board's x/5 progress: tasks, availability, sim, interviewPassed, cert.
  const completedReqsCount = [
    requirements.tasksDone,
    requirements.availabilitySet,
    requirements.simulationPassed,
    requirements.interviewPassed,
    requirements.certUploaded,
  ].filter(Boolean).length;

  useEffect(() => {
    async function loadApplicant() {
      setIsLoading(true);
      const res = await getAtsCandidates();
      let candidateData: AtsCandidateData | null = null;
      
      if (res.success && res.data) {
        const found = res.data.find(c => c.id === applicantId);
        if (found) {
          candidateData = found;
        }
      }

      // Application dossier + documents from Supabase (Phase 5); localStorage is metadata fallback only
      let submittedForm: {
        fullName?: string;
        email?: string;
        phoneNumber?: string;
        address?: string;
        gender?: string;
        rbtStatus?: string;
        cprStatus?: string;
        yearsExperience?: string;
        languages?: string;
        boroughs?: string;
        weeklyHours?: string;
        availableToStart?: string;
        workAuth?: string;
        backgroundCheck?: string;
        transportation?: string;
        availability?: string;
        additionalNotes?: string;
        fortyHourCertFileName?: string;
        resumeFileName?: string;
        resumeFileDataUrl?: string;
        govtIdFileName?: string;
        govtIdFileDataUrl?: string;
        submittedAt?: string;
      } | null = null;

      const docsRes = await getCandidateDocuments(applicantId);
      if (docsRes.success && docsRes.data) {
        const d = docsRes.data;
        const dossier = d.dossier || {};
        const addrParts = [
          dossier.addressLine1,
          dossier.addressLine2,
          [dossier.city, dossier.state, dossier.zipCode].filter(Boolean).join(' '),
        ].filter(Boolean);
        submittedForm = {
          fullName: candidateData?.name,
          email: candidateData?.email,
          phoneNumber:
            (typeof dossier.phoneNumber === 'string' && dossier.phoneNumber) ||
            candidateData?.phone,
          address: addrParts.length ? addrParts.join(', ') : undefined,
          gender: typeof dossier.gender === 'string' ? dossier.gender : undefined,
          rbtStatus: typeof dossier.rbtStatus === 'string' ? dossier.rbtStatus : undefined,
          cprStatus: typeof dossier.cprStatus === 'string' ? dossier.cprStatus : undefined,
          yearsExperience:
            typeof dossier.yearsExperience === 'string' ? dossier.yearsExperience : undefined,
          languages: Array.isArray(dossier.languages)
            ? (dossier.languages as string[]).join(', ')
            : undefined,
          boroughs: Array.isArray(dossier.preferredBoroughs)
            ? (dossier.preferredBoroughs as string[]).join(', ')
            : undefined,
          weeklyHours: typeof dossier.weeklyHours === 'string' ? dossier.weeklyHours : undefined,
          availableToStart:
            typeof dossier.availableToStart === 'string' ? dossier.availableToStart : undefined,
          workAuth: typeof dossier.workAuth === 'string' ? dossier.workAuth : undefined,
          backgroundCheck: dossier.backgroundCheckConsent ? 'Yes' : undefined,
          transportation:
            typeof dossier.transportation === 'string'
              ? dossier.transportation
              : dossier.hasTransportation
                ? 'Yes'
                : undefined,
          availability: Array.isArray(dossier.availabilityHours)
            ? (dossier.availabilityHours as string[]).join(', ')
            : undefined,
          additionalNotes:
            typeof dossier.additionalNotes === 'string' ? dossier.additionalNotes : undefined,
          fortyHourCertFileName:
            typeof dossier.fortyHourCertFileName === 'string'
              ? dossier.fortyHourCertFileName
              : undefined,
          resumeFileName: d.resumeFileName || undefined,
          resumeFileDataUrl: d.resumeUrl || undefined,
          govtIdFileName: d.govtIdFileName || undefined,
          govtIdFileDataUrl: d.govtIdUrl || undefined,
          submittedAt:
            typeof dossier.submittedAt === 'string' ? dossier.submittedAt : undefined,
        };
        setSubmittedApp(submittedForm);
      } else {
        try {
          const exactStoredApp = localStorage.getItem(`ras_submitted_app_${applicantId}`);
          let storedApp = exactStoredApp;
          if (!storedApp) {
            const latestRaw = localStorage.getItem('ras_latest_submitted_app');
            if (latestRaw) {
              try {
                const latestParsed = JSON.parse(latestRaw);
                if (latestParsed.applicantId === applicantId) storedApp = latestRaw;
              } catch {}
            }
          }
          if (storedApp) {
            submittedForm = JSON.parse(storedApp);
            setSubmittedApp(submittedForm);
          }
        } catch {}
      }

      if (submittedForm) {
        candidateData = {
          id: applicantId,
          name: submittedForm.fullName || candidateData?.name || 'Applicant',
          email: submittedForm.email || candidateData?.email || '',
          phone: submittedForm.phoneNumber || candidateData?.phone || '',
          roleApplied: candidateData?.roleApplied || 'RBT',
          stage: candidateData?.stage || 'APPLIED',
          experienceYears: candidateData?.experienceYears || 0,
          appliedDate: submittedForm.submittedAt
            ? submittedForm.submittedAt.split('T')[0]
            : candidateData?.appliedDate || new Date().toISOString().split('T')[0],
          activationStatus: candidateData?.activationStatus || 'PENDING_HR_REVIEW',
          userId: candidateData?.userId,
        };
      } else if (!candidateData) {
        candidateData = {
          id: applicantId,
          name: 'Applicant',
          email: '',
          phone: '',
          roleApplied: 'RBT',
          stage: 'APPLIED',
          experienceYears: 0,
          appliedDate: new Date().toISOString().split('T')[0],
          activationStatus: 'PENDING_HR_REVIEW',
        };
      }

      // Load interview from AtsInterview (Phase 2 SoT)
      const interviewRes = await getAtsInterview(applicantId);
      const interviewRow = interviewRes.data;
      if (interviewRow) {
        setInterviewPayload({
          candidateName: candidateData?.name,
          candidateEmail: candidateData?.email,
          candidateId: applicantId,
          hrInterviewer: interviewRow.interviewerName || undefined,
          date: interviewRow.scheduledDate || undefined,
          time: interviewRow.scheduledTime || undefined,
          meetingCode: interviewRow.meetingCode || undefined,
          meetingLink: interviewRow.meetingLink || undefined,
          status: interviewRow.status,
          bookedAt: interviewRow.scheduledAt || undefined,
        });
        if (interviewRow.interviewerNotes) setInterviewerNotes(interviewRow.interviewerNotes);
        if (interviewRow.completedScriptSteps.length > 0) {
          setCompletedScriptSteps(interviewRow.completedScriptSteps);
        }
        if (interviewRow.scorecard && Object.keys(interviewRow.scorecard).length > 0) {
          setScorecardCategories((prev) => ({
            ...prev,
            ...(interviewRow.scorecard as typeof prev),
          }));
        }
        setIsInterviewClaimed(Boolean(interviewRow.claimedByUserId));
        if (interviewRow.recommendation === 'ADVANCE' || interviewRow.recommendation === 'RECOMMEND_HIRE') {
          setRecommendationDecision('RECOMMEND_HIRE');
        } else if (interviewRow.recommendation === 'REJECT') {
          setRecommendationDecision('REJECT');
        } else if (interviewRow.recommendation === 'HOLD' || interviewRow.recommendation === 'NO_OPINION') {
          setRecommendationDecision('NO_OPINION');
        }
      }

      // Load recorded videos from Supabase Storage (Phase 4)
      getRecordingsFromIDB(applicantId).then((videos) => {
        if (videos && videos.length > 0) {
          setRecordedVideos(videos);
          setActiveVideoUrl(videos[0].url);
        }
      });

      // Requirements from CandidateOnboardingPacket (Phase 1 SoT)
      const progressRes = await getOnboardingProgress(applicantId);
      const snap = progressRes.data;
      const isInterviewBooked =
        !!snap?.interviewBooked ||
        !!interviewRow ||
        candidateData?.stage === 'INTERVIEW' ||
        !!snap?.interviewPassed;

      setRequirements({
        tasksDone: !!snap?.tasksDone,
        certUploaded: !!snap?.certUploaded,
        simulationPassed: !!snap?.simulationDone,
        availabilitySet: !!snap?.availabilityDone,
        interviewBooked: isInterviewBooked,
        interviewPassed: !!snap?.interviewPassed || interviewRow?.status === 'COMPLETED',
        backgroundCleared: !!snap?.backgroundCleared,
      });

      // HIRED flow end: surface the linked RBT user + case-opening claim state honestly
      if (candidateData?.stage === 'HIRED') {
        const hiredRes = await getHiredCandidateSummary(applicantId);
        setHiredSummary(hiredRes.success && hiredRes.data ? hiredRes.data : null);
      } else {
        setHiredSummary(null);
      }

      setApplicant(candidateData);
      setIsLoading(false);
    }

    loadApplicant();
    window.addEventListener('rbt_interview_changed', loadApplicant);
    window.addEventListener('rbt_availability_changed', loadApplicant);
    window.addEventListener('rbt_sim_changed', loadApplicant);
    window.addEventListener('rbt_progress_synced', loadApplicant);
    return () => {
      window.removeEventListener('rbt_interview_changed', loadApplicant);
      window.removeEventListener('rbt_availability_changed', loadApplicant);
      window.removeEventListener('rbt_sim_changed', loadApplicant);
      window.removeEventListener('rbt_progress_synced', loadApplicant);
    };
  }, [applicantId]);

  // In-Browser MediaRecorder Handlers with Audio Mixing (Mic + Display Audio)
  const handleStartRecording = async () => {
    try {
      // 1. Capture screen / tab audio & video
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // 2. Capture HR Agent local microphone audio
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.warn('Microphone permission not granted or unavailable:', micErr);
      }

      // 3. Mix both audio streams using Web Audio API AudioContext
      const audioWindow = window as WebKitAudioWindow;
      const AudioContextConstructor =
        audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error('Web Audio API is not available.');
      }
      const audioCtx = new AudioContextConstructor();
      const destination = audioCtx.createMediaStreamDestination();

      if (displayStream.getAudioTracks().length > 0) {
        const displaySource = audioCtx.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
        displaySource.connect(destination);
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }

      // Combine screen video track with mixed audio track
      const combinedTracks = [
        ...displayStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ];
      const combinedStream = new MediaStream(combinedTracks);

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const title = `Interview Take ${recordedVideos.length + 1}`;
        const localPreview = URL.createObjectURL(blob);
        setActiveVideoUrl(localPreview);
        setUploadProgress(0);
        toast.message('Saving interview take…');

        void saveRecordingBlob({
          applicantId,
          title,
          blob,
          duration: recordingDuration,
          onProgress: (percent) => setUploadProgress(percent),
        })
          .then((res) => {
            setUploadProgress(null);
            if (!res.success || !res.item) {
              toast.error(res.error || 'Failed to save recording');
              return;
            }
            setRecordedVideos((prev) => [res.item!, ...prev.filter((v) => v.id !== res.item!.id)]);
            setActiveVideoUrl(res.item!.url);
            toast.success(`${title} saved successfully.`);
          })
          .catch((err) => {
            setUploadProgress(null);
            console.error('Recording save error:', err);
            toast.error('Save failed — check your connection and try again.');
          });
      };

      // Stop recording automatically if user stops screen sharing from browser bar
      displayStream.getVideoTracks()[0].onended = () => {
        handleStopRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      toast.success('🔴 Live recording started! Conducting interview screen...');
    } catch {
      toast.error('Recording cancelled or screen permission denied.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setIsRecording(false);
  };

  const handleDeleteTake = async (takeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await deleteRecordingFromIDB(takeId);
    if (!ok) {
      toast.error('Failed to delete recording');
      return;
    }
    setRecordedVideos(prev => {
      const updated = prev.filter(v => v.id !== takeId);
      if (activeVideoUrl === prev.find(v => v.id === takeId)?.url) {
        setActiveVideoUrl(updated[0]?.url || null);
      }
      return updated;
    });
    toast.success('Interview take deleted.');
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    const res = await saveInterviewNotes(applicantId, interviewerNotes);
    setIsSavingNotes(false);
    if (!res.success) {
      toast.error(res.error || 'Failed to save notes');
      return;
    }
    toast.success('Interviewer notes saved to candidate dossier.');
  };

  const updateScorecardCategory = (
    key: ScorecardCategoryKey,
    update: Partial<InterviewScorecard[ScorecardCategoryKey]>
  ) => {
    scorecardRevisionRef.current += 1;
    setIsScorecardDirty(true);
    setScorecardCategories((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  };

  const persistScorecard = async (showSuccessToast = true) => {
    const revisionBeingSaved = scorecardRevisionRef.current;
    setIsSavingScorecard(true);
    try {
      const result = await saveInterviewScorecard(applicantId, scorecardCategories);
      if (!result.success) {
        toast.error(result.error || 'Failed to save scorecard.');
        return false;
      }
      if (scorecardRevisionRef.current === revisionBeingSaved) setIsScorecardDirty(false);
      if (showSuccessToast) toast.success('Interview scorecard saved.');
      return true;
    } catch {
      toast.error('Failed to save scorecard. Please try again.');
      return false;
    } finally {
      setIsSavingScorecard(false);
    }
  };

  const handleApproveAndInvite = async () => {
    if (!applicant) return;

    const res = await inviteCandidate(applicant.id);
    if (!res.success) {
      toast.error(res.error || 'Invite failed');
      return;
    }

    setApplicant((prev) =>
      prev
        ? {
            ...prev,
            stage: res.candidate?.stage || 'PHONE_SCREEN',
            activationStatus: res.candidate?.activationStatus || 'INVITATION_SENT',
          }
        : null
    );

    if (res.magicLinkUrl) {
      try {
        await navigator.clipboard.writeText(res.magicLinkUrl);
        toast.success(`Approved ${applicant.name} — moved to In Progress. Magic link copied.`);
      } catch {
        toast.success(`Approved ${applicant.name} — moved to In Progress.`);
      }
    } else {
      toast.success(`Approved ${applicant.name}! Moved to "2. In Progress".`);
    }
  };

  const copyMagicLink = async () => {
    if (!applicant) return;
    setIsCopyingMagicLink(true);
    try {
      const result = await getActiveCandidateMagicLink(applicant.id);
      if (!result.success || !result.magicLinkUrl) {
        toast.error(result.error || 'No active invitation is available.');
        return;
      }
      await navigator.clipboard.writeText(result.magicLinkUrl);
      setCopied(true);
      toast.success('Active magic link copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy the invitation. Check clipboard permission and try again.');
    } finally {
      setIsCopyingMagicLink(false);
    }
  };

  const handleReleaseInterviewClaim = async () => {
    setIsReleasingInterview(true);
    try {
      const result = await releaseAtsInterviewClaim(applicantId);
      if (!result.success) {
        toast.error(result.error || 'Failed to release interview claim.');
        return;
      }
      setIsInterviewClaimed(false);
      toast.success('Interview claim released back to the HR queue.');
    } catch {
      toast.error('Failed to release interview claim. Please try again.');
    } finally {
      setIsReleasingInterview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-zinc-400 font-mono text-xs animate-pulse">
        Loading candidate dossier...
      </div>
    );
  }

  if (!applicant) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-zinc-400">Applicant profile not found.</p>
        <Link href="/ats">
          <Button variant="secondary" className="text-xs">← Back to ATS Pipeline</Button>
        </Link>
      </div>
    );
  }



  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in text-white pb-16">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <Link href="/ats" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-brand-orange-400 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to ATS Pipeline
        </Link>
        <span className="text-xs font-mono font-bold text-brand-orange-400 bg-brand-orange-500/10 px-3 py-1 rounded-full border border-brand-orange-500/20">
          APPLICANT DOSSIER • ID: {applicant.id.slice(0, 8)}
        </span>
      </div>

      {/* Applicant Header Profile Banner */}
      <div className="bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-orange-500 to-amber-600 text-white flex items-center justify-center font-black text-2xl shadow-lg border border-white/20">
            {applicant.name.substring(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black text-white font-heading">{applicant.name}</h1>
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-brand-orange-500/10 text-brand-orange-400 border border-brand-orange-500/20 uppercase tracking-wide">
                Stage: {applicant.stage.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-1.5 flex items-center gap-4">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-zinc-500" /> {applicant.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {applicant.phone}</span>
            </p>
          </div>
        </div>

        {/* HR Action Header Status & Delete Button */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3">
          {applicant.activationStatus === 'INVITATION_SENT' || applicant.activationStatus === 'ACTIVE' || applicant.stage === 'PHONE_SCREEN' || applicant.stage === 'INTERVIEW' || applicant.stage === 'OFFER' || applicant.stage === 'HIRED' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-xs font-bold text-emerald-400 block">✓ Magic Link Issued</span>
                <div className="flex items-center gap-3 mt-0.5">
                  <button
                    onClick={() => void copyMagicLink()}
                    disabled={isCopyingMagicLink}
                    className="text-[10px] text-zinc-300 hover:text-white disabled:text-zinc-600 underline font-mono flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopyingMagicLink ? 'Checking…' : copied ? 'Copied URL!' : 'Copy Magic Link URL'}</span>
                  </button>
                  <span className="text-[10px] text-zinc-600">•</span>
                  <button
                    onClick={handleResetDeviceLock}
                    disabled={isResettingDeviceLock}
                    className="text-[10px] text-amber-400 hover:text-amber-300 disabled:text-zinc-600 underline font-mono cursor-pointer disabled:cursor-not-allowed"
                    title="Clear hardware device binding lock"
                  >
                    {isResettingDeviceLock ? 'Resetting…' : 'Reset Device Lock'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleApproveAndInvite}
              className="w-full sm:w-auto bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs px-6 h-11 rounded-2xl shadow-xl cursor-pointer flex items-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>Approve &amp; Send Magic Link</span>
            </Button>
          )}

          <button
            onClick={() => {
              setDeleteConfirmationText('');
              setShowDeleteModal(true);
            }}
            className="w-full sm:w-auto bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-extrabold text-xs px-4 h-11 rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md"
            title="Permanently remove candidate from ATS"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Delete Applicant</span>
          </button>
        </div>
      </div>

      {/* HIRED FLOW END: LINKED RBT ACCOUNT & CASE-OPENING CLAIM STATE */}
      {applicant.stage === 'HIRED' && (
        <div className="bg-zinc-950/80 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
          <div className="absolute -top-16 right-10 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-black text-white font-heading flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              Hired — RBT Account &amp; Case Placement
            </h3>
            <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              Hire Complete
            </span>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Linked staff account */}
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 block">Linked Staff Account</span>
              {hiredSummary?.linkedUser ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-extrabold text-white flex items-center gap-2">
                    {hiredSummary.linkedUser.name}
                    <span className={`text-[9px] font-mono font-extrabold px-2 py-0.5 rounded-full border ${
                      hiredSummary.linkedUser.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {hiredSummary.linkedUser.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-zinc-500" /> {hiredSummary.linkedUser.email}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono">
                    Role: <span className="text-white font-bold">{hiredSummary.linkedUser.role}</span>
                    <span className="mx-2 text-zinc-600">•</span>
                    Caseload: <span className={`font-bold ${hiredSummary.linkedUser.caseloadCount > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {hiredSummary.linkedUser.caseloadCount} client{hiredSummary.linkedUser.caseloadCount === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300 font-medium">
                    No staff account is linked to this hired candidate — the hire did not complete user creation. Re-run the hire from the Offer stage or contact an admin.
                  </p>
                </div>
              )}
            </div>

            {/* Case-opening claims */}
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 block">
                Case-Opening Claims ({hiredSummary?.caseApplications.length ?? 0})
              </span>
              {hiredSummary && hiredSummary.caseApplications.length > 0 ? (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {hiredSummary.caseApplications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950/80 border border-white/5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-white font-mono truncate">{app.caseCode}</p>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          {app.borough || 'Borough —'} · {app.weeklyHours != null ? `${app.weeklyHours} hrs/wk` : 'hrs —'} · Opening {app.openingStatus}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[9px] font-mono font-extrabold px-2 py-0.5 rounded-full border ${
                        app.status === 'APPROVED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : app.status === 'REJECTED' || app.status === 'WITHDRAWN'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 font-mono p-3 rounded-xl bg-zinc-950/60 border border-dashed border-white/10 text-center">
                  {hiredSummary?.linkedUser
                    ? 'No case-opening claims yet — not assigned via the job board.'
                    : 'Claim state unavailable without a linked staff account.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white relative">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-zinc-900/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-orange-500/10 border border-brand-orange-500/30 flex items-center justify-center text-brand-orange-400">
                  {previewDoc.type === 'RESUME' ? <FileText className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5 text-blue-400" />}
                </div>
                <div>
                  <h3 className="font-black text-white text-sm font-heading">{previewDoc.name}</h3>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                    Verified Application Attachment • PDF Preview Mode
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Document Viewer Canvas */}
            <div className="flex-1 overflow-hidden p-0 bg-zinc-950 flex items-center justify-center min-h-[450px]">
              {previewDoc.type === 'RESUME' ? (
                submittedApp?.resumeFileDataUrl ? (
                  /\.(jpe?g|png|webp)(\?|$)/i.test(submittedApp.resumeFileDataUrl) ||
                  submittedApp.resumeFileDataUrl.startsWith('data:image/') ? (
                    <Image
                      loader={uploadedDocumentImageLoader}
                      unoptimized
                      src={submittedApp.resumeFileDataUrl}
                      alt="Uploaded Resume Document"
                      width={1600}
                      height={1200}
                      className="w-auto h-auto max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                    />
                  ) : (
                    <iframe src={`${submittedApp.resumeFileDataUrl}#toolbar=0&navpanes=0`} className="w-full h-[75vh] rounded-2xl border-0" title="Uploaded Resume PDF" />
                  )
                ) : (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-white">{submittedApp?.resumeFileName || 'Resume Document'}</h3>
                      <p className="text-xs text-zinc-400 max-w-sm font-mono mx-auto">
                        No resume on file in secure storage for this candidate yet.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                submittedApp?.govtIdFileDataUrl ? (
                  /\.(jpe?g|png|webp)(\?|$)/i.test(submittedApp.govtIdFileDataUrl) ||
                  submittedApp.govtIdFileDataUrl.startsWith('data:image/') ? (
                    <Image
                      loader={uploadedDocumentImageLoader}
                      unoptimized
                      src={submittedApp.govtIdFileDataUrl}
                      alt="Uploaded Government Photo ID"
                      width={1600}
                      height={1200}
                      className="w-auto h-auto max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                    />
                  ) : (
                    <iframe src={`${submittedApp.govtIdFileDataUrl}#toolbar=0&navpanes=0`} className="w-full h-[75vh] rounded-2xl border-0" title="Uploaded Government ID PDF" />
                  )
                ) : (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-white">{submittedApp?.govtIdFileName || 'Government Photo ID'}</h3>
                      <p className="text-xs text-zinc-400 max-w-sm font-mono mx-auto">
                        No government ID on file in secure storage for this candidate yet.
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-white/10 bg-zinc-950 flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-mono">File: {previewDoc.name}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition-colors cursor-pointer border border-white/10"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => {
                    toast.success(`Downloading ${previewDoc.name}`);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#F97316] hover:bg-orange-600 text-white text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Attachment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {showDeleteModal && (
        <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-950 border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 relative text-white">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <AlertOctagon className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-black text-white font-heading">Delete Candidate Dossier?</h3>
              <p className="text-xs text-zinc-400">
                You are about to permanently remove <strong className="text-white">{applicant.name}</strong> from the ATS Applicant Pipeline. This action cannot be undone.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/20 space-y-2 text-xs">
              <label className="text-rose-300 font-bold block">
                Type <span className="bg-rose-500/20 px-2 py-0.5 rounded font-mono text-rose-200 uppercase font-black">DELETE</span> below to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Type DELETE here..."
                className="w-full bg-zinc-900 border border-rose-500/40 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-rose-400"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteApplicant}
                disabled={deleteConfirmationText.trim() !== 'DELETE' || isDeleting}
                className={`flex-1 text-xs font-black py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg ${
                  deleteConfirmationText.trim() === 'DELETE' && !isDeleting
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                    : 'bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORE NAVIGATION TABS */}
      {(() => {
        const isInterviewSubmitted = requirements.interviewPassed;
        const hasInterviewAccess = requirements.interviewBooked || requirements.interviewPassed || applicant.stage === 'INTERVIEW' || isInterviewSubmitted;
        const navigationTabs: ApplicantProfileNavigationTab[] = [
          { id: 'OVERVIEW', label: 'Overview & Application Form', icon: User },
          ...(applicant.stage !== 'APPLIED'
            ? [{ id: 'PROGRESS' as const, label: 'Task Requirements & Progress', icon: ClipboardList }]
            : []),
          ...(hasInterviewAccess
            ? [{
                id: 'INTERVIEW' as const,
                label: isInterviewSubmitted
                  ? '✓ HR Interview (Submitted & Sealed)'
                  : '🎥 1-on-1 HR Video Interview & Notes',
                icon: Video,
                badge: isInterviewSubmitted ? 'LOCKED' : 'LIVE INTERVIEW',
              }]
            : []),
          ...(role === 'HEAD_HR'
            ? [{
                id: 'EXTEND_OFFER' as const,
                label: 'Extend Offer (LS-54)',
                icon: FileText,
                badge: 'HEAD HR',
              }]
            : []),
          ...(role === 'HEAD_HR'
            ? [{
                id: 'AUDIT' as const,
                label: 'Onboarding Audit Trail',
                icon: ShieldCheck,
                badge: 'HEAD HR ONLY',
              }]
            : []),
        ];

        return (
          <div className="flex items-center gap-2 border-b border-white/10 pb-3 flex-wrap">
            {navigationTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2.5 transition-all cursor-pointer border ${
                    isActive 
                      ? 'bg-[#F97316] text-white border-orange-500 shadow-lg shadow-orange-500/20' 
                      : 'bg-zinc-950 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className={`text-[9px] font-extrabold font-mono px-2 py-0.5 rounded-full ${
                      tab.badge === 'LOCKED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : tab.badge === 'LIVE INTERVIEW'
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 animate-pulse'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {activeTab === 'EXTEND_OFFER' && role === 'HEAD_HR' && (
        <ExtendOfferTab
          key={applicantId}
          candidateId={applicantId}
          candidateName={applicant.name}
          preparerName="Head of HR"
        />
      )}

      {/* TAB: LEGAL E-SIGNATURE AUDIT TRAIL (HEAD HR ONLY) */}
      {activeTab === 'AUDIT' && role === 'HEAD_HR' && (
        <AtsApplicantAuditView applicantId={applicantId} candidateName={applicant.name} />
      )}

      {/* TAB 1: OVERVIEW & FILLED APPLICATION FORM */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6 animate-fade-in">
          <Card className="border-white/10 bg-zinc-950 shadow-xl">
            <CardHeader className="pb-4 border-b border-white/5">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-orange-500" />
                Submitted RBT Job Application Dossier
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6 text-xs">
              {/* Section 1: Candidate Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Applicant Full Name</span>
                  <p className="text-white font-extrabold text-sm">{applicant.name}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Email Address</span>
                  <p className="text-white font-mono text-xs">{applicant.email}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Phone Contact</span>
                  <p className="text-white font-mono text-xs">{applicant.phone}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Position Applied</span>
                  <p className="text-white font-extrabold text-sm">{applicant.roleApplied} (Behavior Technician)</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Clinical Experience</span>
                  <p className="text-white font-extrabold text-sm">{applicant.experienceYears} Years Caregiving / ABA</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-1">
                  <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold">Application Date</span>
                  <p className="text-white font-mono text-xs">{applicant.appliedDate}</p>
                </div>
              </div>

              {/* Section 2: Submitted PDF Uploads & Document Attachments */}
              <div className="p-5 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-4">
                <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
                  <Paperclip className="w-4 h-4 text-brand-orange-500" />
                  Uploaded Verification Documents (Resume &amp; Government Photo ID)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* PDF Document 1: Official Resume / Curriculum Vitae */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-white/10 flex items-center justify-between hover:border-brand-orange-500/50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-bold shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-xs group-hover:text-brand-orange-400 transition-colors">
                          {submittedApp?.resumeFileName || 'Uploaded_Resume.pdf'}
                        </h5>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Resume / CV • Verified Document Upload</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setPreviewDoc({
                            name: submittedApp?.resumeFileName || 'Uploaded_Resume.pdf',
                            type: 'RESUME',
                          });
                        }}
                        className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        title="Preview Resume PDF"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <a
                        href={submittedApp?.resumeFileDataUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!submittedApp?.resumeFileDataUrl) {
                            e.preventDefault();
                            toast.error('No resume file in storage');
                          }
                        }}
                        className="p-2 rounded-lg bg-brand-orange-500/20 hover:bg-brand-orange-500/30 text-brand-orange-400 transition-colors cursor-pointer"
                        title="Download Resume"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* PDF Document 2: Government Issued Photo ID */}
                  <div className="p-4 rounded-xl bg-zinc-950 border border-white/10 flex items-center justify-between hover:border-brand-orange-500/50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-xs group-hover:text-brand-orange-400 transition-colors">
                          {submittedApp?.govtIdFileName || 'Government_Photo_ID.pdf'}
                        </h5>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Govt Photo ID • Verified Identification Card</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setPreviewDoc({
                            name: submittedApp?.govtIdFileName || 'Government_Photo_ID.pdf',
                            type: 'GOVT_ID',
                          });
                        }}
                        className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        title="Preview Photo ID PDF"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <a
                        href={submittedApp?.govtIdFileDataUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!submittedApp?.govtIdFileDataUrl) {
                            e.preventDefault();
                            toast.error('No government ID file in storage');
                          }
                        }}
                        className="p-2 rounded-lg bg-brand-orange-500/20 hover:bg-brand-orange-500/30 text-brand-orange-400 transition-colors cursor-pointer"
                        title="Download Photo ID"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Filled Application Form Answers */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-4">
                <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Complete Submitted Application Questionnaire
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-zinc-300">
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Residential Address</span>
                    <p className="font-semibold text-white">{submittedApp?.address || 'Not Provided'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">40-Hour Course Status</span>
                    <p className="font-semibold text-white">{submittedApp?.rbtStatus || 'Not Specified'}</p>
                    {submittedApp?.fortyHourCertFileName && (
                      <p className="text-[10px] font-mono text-emerald-400 mt-1">
                        Cert on file: {submittedApp.fortyHourCertFileName}
                      </p>
                    )}
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Preferred Boroughs</span>
                    <p className="font-semibold text-white">{submittedApp?.boroughs || 'Not Specified'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Start / Weekly Hours</span>
                    <p className="font-semibold text-white">
                      {submittedApp?.availableToStart || '—'} · {submittedApp?.weeklyHours || '—'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Transportation</span>
                    <p className="font-semibold text-white">{submittedApp?.transportation || 'Not Specified'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Experience / Languages</span>
                    <p className="font-semibold text-white">
                      {submittedApp?.yearsExperience || '—'} · {submittedApp?.languages || '—'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Working Availability</span>
                    <p className="font-semibold text-white">{submittedApp?.availability || 'Not Specified'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-500 block">Work Auth &amp; Background</span>
                    <p className="font-semibold text-emerald-400">
                      Auth: {submittedApp?.workAuth || '—'} · BG: {submittedApp?.backgroundCheck || '—'} · CPR:{' '}
                      {submittedApp?.cprStatus || '—'}
                    </p>
                  </div>
                  {submittedApp?.additionalNotes && (
                    <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/5 space-y-1 md:col-span-2">
                      <span className="text-[10px] font-mono text-zinc-500 block">Additional Notes</span>
                      <p className="font-semibold text-white whitespace-pre-wrap">{submittedApp.additionalNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: TASK REQUIREMENTS & PROGRESS */}
      {activeTab === 'PROGRESS' && (
        <Card className="border-white/10 bg-zinc-950 shadow-xl animate-fade-in">
          <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-brand-orange-500" />
                RBT Onboarding Task Requirements Checklist
              </CardTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Live task completion status reported from candidate portal.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-xs font-semibold text-zinc-400">Offer Requirements:</span>
              <span className="text-xs font-mono font-black text-brand-orange-400">{completedReqsCount}/5 ({completedReqsCount * 20}%)</span>
            </div>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Onboarding Forms & E-Signatures (tasksDone — OFFER gate) */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
              requirements.tasksDone ? 'bg-emerald-500/10 border-emerald-500/30 text-white' : 'bg-amber-500/10 border-amber-500/20 text-white'
            }`}>
              <CheckSquare className={`w-5 h-5 shrink-0 mt-0.5 ${requirements.tasksDone ? 'text-emerald-400' : 'text-amber-500'}`} />
              <div>
                <h4 className="text-xs font-bold text-white">1. Onboarding Forms &amp; E-Signatures</h4>
                <p className="text-[11px] text-zinc-400 mt-1">All required onboarding tasks &amp; signature forms.</p>
                <span className={`text-[10px] font-mono block mt-2 font-bold ${requirements.tasksDone ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {requirements.tasksDone ? '✓ All Forms Signed' : '⏳ Forms Outstanding'}
                </span>
              </div>
            </div>

            {/* 2. BACB 40-Hour Certificate (MANDATORY) */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
              requirements.certUploaded ? 'bg-emerald-500/10 border-emerald-500/30 text-white' : 'bg-rose-500/10 border-rose-500/20 text-white'
            }`}>
              <Award className={`w-5 h-5 shrink-0 mt-0.5 ${requirements.certUploaded ? 'text-emerald-400' : 'text-rose-400'}`} />
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-xs font-bold text-white">2. 40-Hour BACB Training</h4>
                  <span className="text-[9px] font-mono font-extrabold bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/40">
                    Mandatory
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Required before wage offer / hire.</p>
                <span className={`text-[10px] font-mono block mt-2 font-bold ${requirements.certUploaded ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {requirements.certUploaded ? '✓ Complete' : '⏳ Awaiting Upload'}
                </span>
              </div>
            </div>

            {/* 3. EMR Data Simulation */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
              requirements.simulationPassed ? 'bg-emerald-500/10 border-emerald-500/30 text-white' : 'bg-amber-500/10 border-amber-500/20 text-white'
            }`}>
              <Award className={`w-5 h-5 shrink-0 mt-0.5 ${requirements.simulationPassed ? 'text-emerald-400' : 'text-amber-500'}`} />
              <div>
                <h4 className="text-xs font-bold text-white">3. EMR Data Simulation</h4>
                <p className="text-[11px] text-zinc-400 mt-1">Completed trial logging &amp; BRP test.</p>
                <span className={`text-[10px] font-mono block mt-2 font-bold ${requirements.simulationPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {requirements.simulationPassed ? '✓ Passed (100% Accuracy)' : '⏳ Pending Simulation'}
                </span>
              </div>
            </div>

            {/* 3. Availability Grid */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
              requirements.availabilitySet ? 'bg-emerald-500/10 border-emerald-500/30 text-white' : 'bg-amber-500/10 border-amber-500/20 text-white'
            }`}>
              <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${requirements.availabilitySet ? 'text-emerald-400' : 'text-amber-500'}`} />
              <div>
                <h4 className="text-xs font-bold text-white">4. Availability Grid</h4>
                <p className="text-[11px] text-zinc-400 mt-1">Weekly work availability submitted.</p>
                <span className={`text-[10px] font-mono block mt-2 font-bold ${requirements.availabilitySet ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {requirements.availabilitySet ? '✓ Grid Submitted' : '⏳ Awaiting Submission'}
                </span>
              </div>
            </div>

            {/* 5. HR Interview & Evaluation (interviewPassed is the OFFER gate; booked is intermediate) */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
              requirements.interviewPassed
                ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                : requirements.interviewBooked
                ? 'bg-blue-500/10 border-blue-500/30 text-white'
                : 'bg-amber-500/10 border-amber-500/20 text-white'
            }`}>
              <Video className={`w-5 h-5 shrink-0 mt-0.5 ${
                requirements.interviewPassed ? 'text-emerald-400' : requirements.interviewBooked ? 'text-blue-400' : 'text-amber-500'
              }`} />
              <div>
                <h4 className="text-xs font-bold text-white">5. 1-on-1 HR Interview &amp; Evaluation</h4>
                <p className="text-[11px] text-zinc-400 mt-1">Booked slot counts toward the Interview column; only a submitted HR evaluation clears this requirement.</p>
                <span className={`text-[10px] font-mono block mt-2 font-bold ${
                  requirements.interviewPassed ? 'text-emerald-400' : requirements.interviewBooked ? 'text-blue-400' : 'text-amber-400'
                }`}>
                  {requirements.interviewPassed
                    ? '✓ Conducted & HR Evaluation Submitted'
                    : requirements.interviewBooked
                    ? '🗓 Slot Booked — Awaiting HR Evaluation'
                    : '⏳ Awaiting Booking'}
                </span>
              </div>
            </div>

            {/* Background Check Clearance (pre-hire clearance — does not gate the Offer stage) */}
            <div className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
              requirements.backgroundCleared ? 'bg-emerald-500/10 border-emerald-500/30 text-white' : 'bg-amber-500/10 border-amber-500/20 text-white'
            }`}>
              <div className="flex items-start gap-3">
                <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${requirements.backgroundCleared ? 'text-emerald-400' : 'text-amber-500'}`} />
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-xs font-bold text-white">Background Check</h4>
                    <span className="text-[9px] font-mono font-extrabold bg-zinc-500/20 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-500/40">
                      Clearance — not an Offer gate
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">NYS Executive Law §296(16) &amp; SCR clearance. Tracked separately from the 5 offer requirements.</p>
                  <span className={`text-[10px] font-mono block mt-2 font-bold ${requirements.backgroundCleared ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {requirements.backgroundCleared ? '✓ Cleared' : '⏳ Pending NYS Background'}
                  </span>
                </div>
              </div>

              {/* HR CLEARANCE TOGGLE BUTTON */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !requirements.backgroundCleared;
                  void updateCandidateProgress(applicantId, { backgroundCleared: nextVal }).then((res) => {
                    if (!res.success) {
                      toast.error(res.error || 'Failed to update background clearance');
                      return;
                    }
                    setRequirements((prev) => ({ ...prev, backgroundCleared: nextVal }));
                    toast.success(nextVal ? '✓ Background check marked as Cleared!' : 'Background check marked as Pending.');
                  });
                }}
                className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer shrink-0 mt-1 ${
                  requirements.backgroundCleared
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                }`}
              >
                {requirements.backgroundCleared ? '✓ Cleared' : 'Clear BG Check'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: HR INTERVIEW & NOTES (ENTERPRISE SCRIPT & SCORECARD DOSSIER) */}
      {activeTab === 'INTERVIEW' && (
        <div className="space-y-6 animate-fade-in">
          {/* SUBMITTED & SEALED AUDIT BANNER */}
          {(requirements.interviewPassed) && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between text-emerald-400 font-mono text-xs shadow-xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-extrabold text-white text-sm">✓ HR Interview Evaluation Submitted &amp; Sealed</p>
                  <p className="text-zinc-400 text-xs font-medium">Interviewer notes, scorecard ratings, and decision logs are permanently sealed to prevent unauthorized editing.</p>
                </div>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 px-3.5 py-1 rounded-full text-[10px] font-black border border-emerald-500/40 uppercase tracking-wider">
                LOCKED AUDIT RECORD
              </span>
            </div>
          )}
          {/* TOP BAR: CANDIDATE INFO & CLAIM / JOIN CONTROLS */}
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-orange-500/20 border border-brand-orange-500/40 flex items-center justify-center text-brand-orange-400 font-black text-sm">
                {applicant.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>{applicant.name}</span>
                  <span className="text-xs text-zinc-400 font-mono font-normal">• {interviewPayload?.date || 'Fri, Aug 7'} at {interviewPayload?.time || '3:00 PM'}</span>
                </h2>
                <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                  <span>
                    {isInterviewClaimed ? 'Claimed' : 'Assigned'} to{' '}
                    <strong className="text-white">{interviewPayload?.hrInterviewer || 'HR queue'}</strong>
                  </span>
                  {isInterviewClaimed && ['HEAD_HR', 'HR', 'CEO', 'OPS_DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(role) ? (
                    <button
                      type="button"
                      onClick={() => void handleReleaseInterviewClaim()}
                      disabled={isReleasingInterview}
                      className="text-rose-400 hover:underline disabled:text-zinc-600 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isReleasingInterview ? 'Releasing…' : 'Force Unclaim'}
                    </button>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={interviewPayload?.meetingLink || 'https://meet.jit.si/RiseAndShine_HR_Interview_cand_1'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setHasJoinedMeeting(true);
                  void markHrJoinedInterview(applicantId).then((res) => {
                    if (!res.success) {
                      toast.error(res.error || 'Failed to sync HR join');
                      return;
                    }
                    window.dispatchEvent(new Event('rbt_interview_changed'));
                    toast.success('Joined meeting — recruiter presence synced for applicant.');
                  });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
              >
                <Video className="w-4 h-4 text-white animate-pulse" />
                <span>Join Meeting</span>
              </a>

              {/* LIVE IN-BROWSER RECORDING CONTROLS (LOCKED UNTIL JOIN MEETING IS CLICKED) */}
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-all animate-pulse"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  <span>⏹️ Stop Recording ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!hasJoinedMeeting) {
                      toast.error('You must click "Join Meeting" first before starting recording!');
                      return;
                    }
                    handleStartRecording();
                  }}
                  disabled={!hasJoinedMeeting}
                  className={`font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all ${
                    hasJoinedMeeting
                      ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-md cursor-pointer'
                      : 'bg-zinc-900 text-zinc-500 border border-white/5 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${hasJoinedMeeting ? 'bg-rose-500 animate-pulse' : 'bg-zinc-600'}`} />
                  <span>⏺️ Record Interview</span>
                </button>
              )}

              {uploadProgress !== null && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-xl border border-brand-orange-500/40 shadow-lg">
                  <Loader2 className="w-3.5 h-3.5 text-brand-orange-400 animate-spin" />
                  <span className="text-xs font-black text-white font-mono whitespace-nowrap">
                    Uploading {uploadProgress}%
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-orange-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MAIN INTERVIEW SPLIT PANEL: LEFT SCRIPT / RIGHT NOTES & SCORECARD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: ACCORDION INTERVIEW SCRIPT (11 STEPS) */}
            <Card className="lg:col-span-4 border-white/10 bg-zinc-950 shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-white/10 bg-zinc-900/50">
                <CardTitle className="text-xs font-black uppercase text-zinc-300 font-mono tracking-wider flex items-center justify-between">
                  <span>Interview Script</span>
                  <span className="text-[10px] text-brand-orange-400 font-mono">11 Guided Steps</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {[
                  { 
                    num: '1', 
                    title: '1. Greeting and Introduction', 
                    body: [
                      'Hello [First Name], how are you. Thanks for meeting with me today. Can you hear me clearly.',
                      'Great. This will take about 15 to 30 minutes. I will ask a few questions about your experience, availability, and fit for the role, then I will cover next steps and leave time for questions.',
                      'To start, are you familiar with what an RBT does day to day.',
                      'If they are unsure: No problem. As an RBT, you provide direct ABA services with a client under a supervising BCBA. You implement skill building and behavior support procedures exactly as written in the treatment plan, prompt and reinforce appropriately, and keep sessions structured and professional.'
                    ] 
                  },
                  { 
                    num: '2', 
                    title: '2. Basic Information', 
                    body: [
                      'Before we get into the interview questions, I am going to quickly confirm the key details we have in HRM and update anything that is missing or changed.',
                      'Can you confirm your full legal name. What is the best phone number to reach you. What is the best email for Google Meet links and updates. What city and zip code are you based in. Is your availability and transportation still accurate.'
                    ] 
                  },
                  { 
                    num: '3', 
                    title: '3. Experience and Background', 
                    body: [
                      'Can you tell me about any experience you have working with children, individuals on the spectrum, or in ABA.',
                      'What settings have you worked in (in home, clinic, school, community). What ages have you worked with, and what age range do you prefer.',
                      'Tell me about a challenging moment during a session and how you handled it.',
                      'Tell me about a time you received feedback from a supervisor and what you changed afterward.'
                    ] 
                  },
                  { 
                    num: '4', 
                    title: '4. How They Heard About Us', 
                    body: [
                      'How did you hear about Rise and Shine ABA. What made you apply.'
                    ] 
                  },
                  { 
                    num: '5', 
                    title: '5. ABA Platforms', 
                    body: [
                      'Have you used an ABA data collection platform (RAS Session Studio, Rethink, or similar) before. What did you use it for. If you have not used one, are you comfortable learning RAS EMR documentation and completing session notes on time.'
                    ] 
                  },
                  { 
                    num: '6', 
                    title: '6. Communication', 
                    body: [
                      'How do you approach communication with the BCBA and with the parent or caregiver. If a caregiver disagrees with the plan or tries to redirect the session, what would you do in the moment. If you are unsure what to do during a session, what is your next step.'
                    ] 
                  },
                  { 
                    num: '7', 
                    title: '7. Availability', 
                    body: [
                      'What does your weekly availability look like. Which days and time blocks can you consistently work. How many hours per week are you looking for. What is your typical travel range. What is your earliest start date.'
                    ] 
                  },
                  { 
                    num: '8', 
                    title: '8. Pay Expectations', 
                    body: [
                      'What hourly rate are you looking for.'
                    ] 
                  },
                  { 
                    num: '9', 
                    title: '9. Previous Company', 
                    body: [
                      'What prompted you to look for a new role. What are you looking for in your next position.'
                    ] 
                  },
                  { 
                    num: '10', 
                    title: '10. Company Expectations', 
                    body: [
                      'Punctuality and reliability. Following the BCBA plan with treatment integrity. Consistent data collection during session. Accurate session start and end times and on-time session notes in RAS Session Studio. Professional communication with families and the clinical team. Do you understand and agree to these expectations.'
                    ] 
                  },
                  { 
                    num: '11', 
                    title: '11. Closing', 
                    body: [
                      'Thank you for your time today. What questions do you have for me. Next steps are [next step]. You will hear from us by [timeframe] via [text or email].'
                    ] 
                  },
                ].map((step, idx) => {
                  const isDone = completedScriptSteps.includes(idx);
                  return (
                    <details key={idx} className={`group border rounded-xl overflow-hidden transition-all ${
                      isDone 
                        ? 'bg-emerald-950/20 border-emerald-500/30' 
                        : 'bg-yellow-500/5 border-yellow-400/40 shadow-sm shadow-yellow-500/5 [&[open]]:border-yellow-400 [&[open]]:bg-zinc-900'
                    }`}>
                      <summary className="p-3 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer flex items-center justify-between list-none font-sans">
                        <span className="flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-open:rotate-90 transition-transform" />
                          <span className={isDone ? 'line-through text-emerald-400' : 'text-white'}>{step.title}</span>
                        </span>
                        {isDone ? (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-extrabold flex items-center gap-1">
                            ✓ Done
                          </span>
                        ) : (
                          <span className="text-[10px] bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                            ⚠️ Pending
                          </span>
                        )}
                      </summary>
                      <div className="p-4 pt-2 border-t border-white/5 text-xs text-zinc-300 leading-relaxed space-y-3 font-sans bg-zinc-950/60">
                        {step.body.map((para, pIdx) => (
                          <p key={pIdx} className="text-zinc-300 font-medium leading-normal">{para}</p>
                        ))}
                        <div className="pt-2 flex justify-end border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isDone) {
                                const updated = completedScriptSteps.filter((i) => i !== idx);
                                setCompletedScriptSteps(updated);
                                void saveInterviewScriptProgress(applicantId, updated);
                                toast.info(`Marked "${step.title}" as incomplete`);
                              } else {
                                const updated = [...completedScriptSteps, idx];
                                setCompletedScriptSteps(updated);
                                void saveInterviewScriptProgress(applicantId, updated);
                                toast.success(`✓ Completed "${step.title}"!`);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                              isDone
                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isDone ? 'Mark Incomplete' : 'Mark Done'}</span>
                          </button>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </CardContent>
            </Card>

            {/* RIGHT COLUMN: SUB-TABS (NOTES, SCORECARD, CANDIDATE INFO), STRUCTURED FIELDS & FOOTER ACTIONS */}
            <Card className="lg:col-span-8 border-white/10 bg-zinc-950 shadow-xl space-y-4">
              <CardHeader className="pb-0 border-b border-white/10 bg-zinc-900/40">
                {/* SUB-TABS HEADER */}
                <div className="flex items-center gap-6 border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('NOTES')}
                    className={`pb-3 text-xs font-black flex items-center gap-2 transition-all border-b-2 cursor-pointer ${
                      activeSubTab === 'NOTES' ? 'text-brand-orange-400 border-brand-orange-500' : 'text-zinc-400 border-transparent hover:text-white'
                    }`}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    <span>Notes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubTab('SCORECARD')}
                    className={`pb-3 text-xs font-black flex items-center gap-2 transition-all border-b-2 cursor-pointer ${
                      activeSubTab === 'SCORECARD' ? 'text-brand-orange-400 border-brand-orange-500' : 'text-zinc-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Scorecard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubTab('CANDIDATE_INFO')}
                    className={`pb-3 text-xs font-black flex items-center gap-2 transition-all border-b-2 cursor-pointer ${
                      activeSubTab === 'CANDIDATE_INFO' ? 'text-brand-orange-400 border-brand-orange-500' : 'text-zinc-400 border-transparent hover:text-white'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Candidate Info</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSubTab('RECORDING')}
                    className={`pb-3 text-xs font-black flex items-center gap-2 transition-all border-b-2 cursor-pointer ${
                      activeSubTab === 'RECORDING' ? 'text-brand-orange-400 border-brand-orange-500' : 'text-zinc-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Recording ({recordedVideos.length})</span>
                    {recordedVideos.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    )}
                  </button>
                </div>
              </CardHeader>

              <CardContent className="pt-2 space-y-6">
                {/* SUB-TAB 1: NOTES & STRUCTURED FIELDS */}
                {activeSubTab === 'NOTES' && (
                  <div className="space-y-6">
                    {/* QUICK NOTES TEXTAREA */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-300 block">Quick Notes</label>
                      <textarea
                        value={interviewerNotes}
                        onChange={(e) => setInterviewerNotes(e.target.value)}
                        placeholder="Type anything during the interview... key observations, red flags, impressions..."
                        rows={6}
                        className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-4 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange-500 font-mono leading-relaxed shadow-inner"
                      />
                    </div>

                    {/* STRUCTURED FIELDS */}
                    <div className="space-y-4 border-t border-white/10 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">Structured Fields</h3>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={syncRbtProfileOnSave}
                            onChange={(e) => setSyncRbtProfileOnSave(e.target.checked)}
                            className="rounded border-white/20 bg-zinc-900 text-brand-orange-500 focus:ring-0 cursor-pointer"
                          />
                          <span>Update RBT profile on save</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-zinc-400 block mb-1">Full legal name</label>
                          <input
                            type="text"
                            value={applicant.name}
                            onChange={(e) => setApplicant({ ...applicant, name: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-brand-orange-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-400 block mb-1">Best phone</label>
                          <input
                            type="text"
                            value={applicant.phone}
                            onChange={(e) => setApplicant({ ...applicant, phone: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-brand-orange-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-400 block mb-1">Best email</label>
                          <input
                            type="email"
                            value={applicant.email}
                            onChange={(e) => setApplicant({ ...applicant, email: e.target.value })}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-brand-orange-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-zinc-400 block mb-1">City / zip</label>
                          <input
                            type="text"
                            value={candidateCityZip}
                            onChange={(e) => setCandidateCityZip(e.target.value)}
                            placeholder="Bronx, NY 10451"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-brand-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-zinc-400 block mb-1">Availability updates / notes</label>
                        <input
                          type="text"
                          value={candidateAvailabilityNotes}
                          onChange={(e) => setCandidateAvailabilityNotes(e.target.value)}
                          placeholder="Available Mon-Fri 3pm-8pm, Saturdays full day..."
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-brand-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB 2: SCORECARD */}
                {activeSubTab === 'SCORECARD' && (
                  <div className="space-y-5">
                    {/* OVERALL SCORE HEADER BANNER */}
                    {(() => {
                      const ratedCount = Object.values(scorecardCategories).filter(c => c.score !== null).length;
                      const isComplete = completedScriptSteps.length === 11 && ratedCount === 8 && recommendationDecision !== null;

                      return (
                        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-black uppercase text-white font-mono tracking-wider">Overall Score Evaluation</h3>
                            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{ratedCount} of 8 categories rated • {completedScriptSteps.length}/11 script steps done</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full border ${
                              isComplete ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                              {isComplete ? '✓ Evaluation Complete' : '⏳ Evaluation Incomplete'}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 8 SCORECARD CATEGORY ROWS */}
                    <div className="space-y-3">
                      {([
                        { key: 'communication', title: 'Communication' },
                        { key: 'adaptability', title: 'Adaptability' },
                        { key: 'professionalism', title: 'Professionalism' },
                        { key: 'empathy', title: 'Empathy & rapport (with client/parent)' },
                        { key: 'abaBasics', title: 'ABA basics' },
                        { key: 'documentation', title: 'Documentation accuracy' },
                        { key: 'reliability', title: 'Reliability' },
                        { key: 'availabilityFit', title: 'Availability fit' },
                      ] satisfies { key: ScorecardCategoryKey; title: string }[]).map((cat) => {
                        const current = scorecardCategories[cat.key];
                        return (
                          <div key={cat.key} className={`rounded-2xl p-3.5 space-y-2 transition-all ${
                            current.score === null
                              ? 'bg-yellow-500/10 border-2 border-yellow-400/50 shadow-md shadow-yellow-500/10'
                              : 'bg-zinc-900/60 border border-white/10'
                          }`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <span className="text-xs font-bold text-white min-w-[200px] flex items-center gap-2">
                                <span>{cat.title}</span>
                                {current.score === null && (
                                  <span className="text-[10px] font-mono font-bold bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-400/40">
                                    ⚠️ Rating Required
                                  </span>
                                )}
                              </span>

                              <div className="flex items-center gap-3 flex-1 justify-end">
                                {/* 1-5 NUMBERED RATING PILLS */}
                                <div className="flex items-center gap-1.5">
                                  {[1, 2, 3, 4, 5].map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => updateScorecardCategory(cat.key, { score: val })}
                                      className={`w-7 h-7 rounded-full text-xs font-mono font-extrabold flex items-center justify-center transition-all cursor-pointer ${
                                        current.score === val
                                          ? 'bg-blue-600 text-white shadow-lg scale-105 border border-blue-400'
                                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-white/5'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>

                                {/* COMMENT INPUT */}
                                <input
                                  type="text"
                                  placeholder="Comment..."
                                  maxLength={1000}
                                  value={current.comment}
                                  onChange={(e) => updateScorecardCategory(cat.key, { comment: e.target.value })}
                                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:border-brand-orange-500 focus:outline-none max-w-[220px] w-full"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <span className={`text-[11px] font-mono ${isScorecardDirty ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {isScorecardDirty ? 'Unsaved scorecard changes' : 'Scorecard saved'}
                      </span>
                      <Button
                        type="button"
                        onClick={() => void persistScorecard()}
                        disabled={!isScorecardDirty || isSavingScorecard}
                        className={`h-10 rounded-xl px-4 text-xs font-bold ${
                          isScorecardDirty && !isSavingScorecard
                            ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer'
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {isSavingScorecard ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSavingScorecard ? 'Saving…' : 'Save Scorecard'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* SUB-TAB 3: CANDIDATE INFO */}
                {activeSubTab === 'CANDIDATE_INFO' && (
                  <div className="space-y-3 p-4 bg-zinc-900 rounded-xl border border-white/5 text-xs text-zinc-300 font-mono">
                    <p><strong className="text-white">Role Applied:</strong> {applicant.roleApplied} Specialist</p>
                    <p><strong className="text-white">Experience:</strong> {applicant.experienceYears} Years in ABA</p>
                    <p><strong className="text-white">Applied Date:</strong> {applicant.appliedDate}</p>
                    <p><strong className="text-white">Current Stage:</strong> {applicant.stage}</p>
                  </div>
                )}

                {/* SUB-TAB 4: DEDICATED RECORDING ARCHIVE TAB (MULTIPLE TAKES PLAYLIST) */}
                {activeSubTab === 'RECORDING' && (
                  <div className="space-y-4">
                    {recordedVideos.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* MAIN VIDEO PLAYER */}
                        <div className="md:col-span-8 p-4 rounded-2xl bg-zinc-900/80 border border-rose-500/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase text-white font-mono flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                              <span>Active Video Recording Player</span>
                            </h4>
                            <span className="text-[10px] font-mono text-zinc-400">Captured in Browser RAM Sandbox</span>
                          </div>
                          <div className="rounded-xl overflow-hidden border border-white/10 shadow-xl bg-black">
                            <video
                              key={activeVideoUrl || recordedVideos[0]?.url}
                              src={activeVideoUrl || recordedVideos[0]?.url}
                              controls
                              autoPlay
                              className="w-full h-auto max-h-[340px] object-contain"
                            />
                          </div>
                        </div>

                        {/* RECORDING PLAYLIST SIDEBAR */}
                        <div className="md:col-span-4 p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-3">
                          <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Session Takes ({recordedVideos.length})</h4>
                            <span className="text-[10px] font-mono text-zinc-400">Click to Play</span>
                          </div>

                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {recordedVideos.map((vid, idx) => {
                              const isActive = (activeVideoUrl || recordedVideos[0]?.url) === vid.url;
                              return (
                                <button
                                  key={vid.id || idx}
                                  type="button"
                                  onClick={() => setActiveVideoUrl(vid.url)}
                                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                    isActive
                                      ? 'bg-rose-500/20 border-rose-500/50 text-white shadow-md'
                                      : 'bg-zinc-950 border-white/5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                                  }`}
                                >
                                  <div>
                                    <div className="text-xs font-bold font-mono flex items-center gap-1.5">
                                      <Video className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{vid.title}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500 block mt-0.5">Recorded at {vid.timestamp}</span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isActive && (
                                      <span className="text-[10px] font-mono font-bold bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/40">
                                        ▶ Playing
                                      </span>
                                    )}
                                    <span
                                      onClick={(e) => handleDeleteTake(vid.id, e)}
                                      className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                      title="Delete Take"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-zinc-900/40 rounded-2xl border border-dashed border-white/10 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                          <Video className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">No Interview Recordings Available</h4>
                          <p className="text-[11px] text-zinc-400 font-mono mt-1">
                            Click &quot;Join Meeting&quot; first, then click &quot;⏺️ Record Interview&quot; in the top bar to record session takes.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* FOOTER ACTIONS BAR: SAVE NOTES & SUBMIT DECISION (UNLOCKED ONLY WHEN SCRIPT + SCORECARD + RECORDING ARE COMPLETE) */}
                {(() => {
                  const ratedCount = Object.values(scorecardCategories).filter(c => c.score !== null).length;
                  const isScriptComplete = completedScriptSteps.length === 11;
                  const isScorecardComplete = ratedCount === 8;
                  const isRecordingComplete = recordedVideos.length >= 1;
                  const canSubmitDecision = isScriptComplete && isScorecardComplete && isRecordingComplete;

                  return (
                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
                      <div className="text-[11px] font-mono">
                        {!canSubmitDecision ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-amber-400 font-bold flex items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30">
                              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
                              <span>Pending Requirements:</span>
                            </span>

                            {!isScriptComplete && (
                              <span className="bg-yellow-400/20 text-yellow-300 font-extrabold px-3 py-1.5 rounded-xl border border-yellow-400/40 shadow-sm animate-pulse">
                                ⚠️ Complete {11 - completedScriptSteps.length} more Script Step{11 - completedScriptSteps.length === 1 ? '' : 's'}
                              </span>
                            )}

                            {!isScorecardComplete && (
                              <span className="bg-yellow-400/20 text-yellow-300 font-extrabold px-3 py-1.5 rounded-xl border border-yellow-400/40 shadow-sm animate-pulse">
                                ⚠️ Rate {8 - ratedCount} more Scorecard Categori{8 - ratedCount === 1 ? 'y' : 'es'}
                              </span>
                            )}

                            {!isRecordingComplete && (
                              <span className="bg-rose-400/20 text-rose-300 font-extrabold px-3 py-1.5 rounded-xl border border-rose-400/40 shadow-sm animate-pulse flex items-center gap-1">
                                <Video className="w-3.5 h-3.5 text-rose-400" />
                                <span>⚠️ Record at least 1 Interview Take</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>✓ Script, Scorecard &amp; Video Take Recorded — Ready to Submit Decision</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          onClick={handleSaveNotes}
                          disabled={isSavingNotes}
                          className="bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 font-bold text-xs px-5 h-11 rounded-xl flex items-center gap-2 cursor-pointer"
                        >
                          <Save className="w-4 h-4 text-zinc-400" />
                          <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
                        </Button>

                        <Button
                          type="button"
                          onClick={() => {
                            if (!canSubmitDecision) {
                              if (!isScriptComplete || !isScorecardComplete) {
                                toast.error('Complete all 11 script steps & rate all 8 categories first!');
                              } else if (!isRecordingComplete) {
                                toast.error('You must record at least 1 interview video take before submitting a decision!');
                              }
                              return;
                            }
                            setShowDecisionModal(true);
                          }}
                          disabled={!canSubmitDecision}
                          className={`font-extrabold text-xs px-6 h-11 rounded-xl flex items-center gap-2 shadow-lg transition-all ${
                            canSubmitDecision
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 cursor-pointer'
                              : 'bg-zinc-800 text-zinc-500 border border-white/5 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submit Decision</span>
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SUBMIT DECISION MODAL (RECOMMEND HIRE, REJECT, NO OPINION + EXPLANATION) */}
      {showDecisionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-brand-orange-500/50 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-black text-white font-heading flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Submit Interview Decision
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">Submit recommendation &amp; notes for Head of HR final verdict</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDecisionModal(false)}
                className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-2 font-mono uppercase tracking-wider">Select Recommendation:</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setRecommendationChoice('RECOMMEND_HIRE')}
                    className={`py-3 px-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border text-center flex flex-col items-center gap-1 ${
                      recommendationChoice === 'RECOMMEND_HIRE'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg ring-2 ring-emerald-500/50'
                        : 'bg-zinc-900 text-zinc-400 border-white/10 hover:bg-zinc-800'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Recommend Hire</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecommendationChoice('REJECT')}
                    className={`py-3 px-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border text-center flex flex-col items-center gap-1 ${
                      recommendationChoice === 'REJECT'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-lg ring-2 ring-rose-500/50'
                        : 'bg-zinc-900 text-zinc-400 border-white/10 hover:bg-zinc-800'
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-rose-300" />
                    <span>Reject</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecommendationChoice('NO_OPINION')}
                    className={`py-3 px-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border text-center flex flex-col items-center gap-1 ${
                      recommendationChoice === 'NO_OPINION'
                        ? 'bg-amber-600 text-white border-amber-400 shadow-lg ring-2 ring-amber-500/50'
                        : 'bg-zinc-900 text-zinc-400 border-white/10 hover:bg-zinc-800'
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 text-amber-300" />
                    <span>No Opinion</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 block font-mono uppercase tracking-wider">Recommendation Explanation / Notes for Head of HR:</label>
                <textarea
                  rows={4}
                  value={recommendationExplanation}
                  onChange={(e) => setRecommendationExplanation(e.target.value)}
                  placeholder="Provide clinical & professional context for your recommendation to help Head of HR make the final verdict..."
                  className="w-full bg-zinc-900 border border-white/10 rounded-2xl p-3.5 text-xs text-white placeholder-zinc-500 font-mono focus:border-brand-orange-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <Button
                type="button"
                onClick={() => setShowDecisionModal(false)}
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 font-bold text-xs px-5 h-11 rounded-xl cursor-pointer"
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={isSubmittingDecision}
                onClick={async () => {
                  if (isSubmittingDecision) return;
                  setIsSubmittingDecision(true);
                  if (isScorecardDirty && !(await persistScorecard(false))) {
                    setIsSubmittingDecision(false);
                    return;
                  }
                  setRecommendationDecision(recommendationChoice);
                  const mapped =
                    recommendationChoice === 'RECOMMEND_HIRE'
                      ? 'ADVANCE'
                      : recommendationChoice === 'REJECT'
                        ? 'REJECT'
                        : 'HOLD';
                  const res = await completeAtsInterview(applicantId, {
                    recommendation: mapped,
                    interviewPassed: recommendationChoice !== 'REJECT',
                  });
                  if (!res.success) {
                    toast.error(res.error || 'Failed to submit decision');
                    setIsSubmittingDecision(false);
                    return;
                  }
                  setShowDecisionModal(false);
                  toast.success(
                    `Interview decision (${recommendationChoice.replace('_', ' ')}) submitted to Head of HR!`
                  );
                  setTimeout(() => router.push('/ats'), 600);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-extrabold text-xs px-6 h-11 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmittingDecision ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isSubmittingDecision ? 'Submitting…' : 'Confirm & Submit to Head of HR'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
