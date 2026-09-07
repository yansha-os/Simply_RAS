/**
 * Unified Chat Utilities for CRM Staff and Parent Magic-Link Portals
 * Implements the Discord/iMessage-style media attachment and Jitsi video call pattern.
 */

export const CALL_PREFIX = '__CALL__|';
export const DOC_PREFIX = '__DOC__|';

export type ParsedMessageContent = {
  type: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  text: string;
  callRoomUrl?: string;
  fileName?: string;
  fileUrl?: string;
};

export function encodeCallContent(url: string, label: string) {
  return `${CALL_PREFIX}${url}|${label}`;
}

export function encodeDocContent(fileUrl: string, fileName: string) {
  return `${DOC_PREFIX}${fileUrl}|${fileName}`;
}

export function parseMessageContent(content?: string | null): ParsedMessageContent {
  if (typeof content !== 'string' || !content) {
    return { type: 'TEXT', text: '' };
  }

  if (content.startsWith(CALL_PREFIX)) {
    const rest = content.slice(CALL_PREFIX.length);
    const pipe = rest.indexOf('|');
    if (pipe >= 0) {
      return {
        type: 'JITSI_CALL',
        callRoomUrl: rest.slice(0, pipe),
        text: rest.slice(pipe + 1) || 'Instant Care Team Video Session',
      };
    }
    return {
      type: 'JITSI_CALL',
      callRoomUrl: rest,
      text: 'Instant Care Team Video Session',
    };
  }

  if (content.startsWith(DOC_PREFIX)) {
    const rest = content.slice(DOC_PREFIX.length);
    const pipe = rest.indexOf('|');
    if (pipe >= 0) {
      const fileUrl = rest.slice(0, pipe);
      const fileName = rest.slice(pipe + 1) || 'Document';
      return {
        type: 'DOCUMENT',
        fileUrl,
        fileName,
        text: `Attached document: ${fileName}`,
      };
    }
    return {
      type: 'DOCUMENT',
      fileUrl: '#',
      fileName: rest || 'Document',
      text: `Attached document: ${rest || 'Document'}`,
    };
  }

  return { type: 'TEXT', text: content };
}

export function generateJitsiRoomUrl(clientId?: string | null, suffix?: string) {
  const cleanId =
    (typeof clientId === 'string' ? clientId : 'room').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'care';
  const stamp = Date.now().toString(36);
  const extra = suffix && typeof suffix === 'string' ? `-${suffix.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  return `https://meet.jit.si/ras-care-${cleanId}-${stamp}${extra}`;
}

export function launchJitsiMeetingWindow(url: string) {
  if (typeof window === 'undefined' || !url || typeof url !== 'string') return;

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  if (isMobile) {
    window.open(url, '_blank');
  } else {
    const width = 1280;
    const height = 800;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      url,
      'jitsi_meeting_window',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
    );
  }
}
