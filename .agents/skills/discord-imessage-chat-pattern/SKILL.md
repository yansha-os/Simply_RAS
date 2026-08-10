---
name: discord-imessage-chat-pattern
description: Use when building or modifying ANY chat box, help desk, messenger, or messaging thread component across the CRM. Enforces an advanced Discord/iMessage/WhatsApp-style UI with a '+' media attachment drawer, host-locked Jitsi instant call creator & candidate request workflow, mobile-responsive call launcher, and glassmorphism styling.
---

# Discord & iMessage-Style Ultra-Premium Chat Pattern

## Core Requirements for All CRM Chat Boxes

Whenever building or editing a messaging component (e.g., Help Desk, RBT Chat, Candidate Dossier Messenger):

### 1. '+' Media Attachment Drawer (Left of Chat Bar)
- Place a glowing `+` icon button to the left of the text input field.
- Clicking `+` toggles an animated popover menu with actions:
  - **📞 Instant Jitsi Call / Request Call:** Generates an instant video/voice meeting invite.
  - **📄 Upload PDF / Document:** Allows users to attach and preview PDF documents.

### 2. Dual Host-Locked Jitsi Call Workflows
- **HR Host-Initiated Call:**
  - HR clicks **📞 Instant Jitsi Call** -> In-thread preview card displays **`👑 Join as Host First`**.
  - Once HR joins as host, active call invite is dispatched to candidate (`🟢 LIVE HR CALL IN PROGRESS — Click to Join`).
- **Candidate Call Request:**
  - Candidate clicks **📞 Request Instant Call** -> Sends Call Request card into thread: `📞 Candidate requested an instant 1-on-1 video call session`.
  - Candidate's button shows `⏳ Waiting for HR Host to Join First...` until HR Agent clicks **`👑 Accept Call & Connect as Host →`**.
  - As soon as HR Agent accepts as host, candidate's button unlocks in real-time (`🟢 HR Host Connected — Join Video Call Now →`).

### 3. Mobile-Responsive Meeting Launcher
- **Desktop/Laptop Devices:** Clicking **`Join Call`** launches a clean centered `1280x800` standalone video call window (`window.open`), bypassing iframe demo restrictions for 100% unlimited call duration.
- **Mobile Devices (iOS Safari / Android Chrome):** Clicking **`Join Call`** opens the room directly in a full-screen new tab (`window.open(url, '_blank')`) allowing native mobile browser layout or seamless handoff to the free Jitsi Meet mobile app!

### 4. Discord / iMessage Aesthetics & Micro-Interactions
- Multi-layered glassmorphism chat bubbles (`bg-zinc-900/80`, `border-white/10`, `backdrop-blur-xl`).
- Dynamic avatar initials (e.g., `AK` for azm karim, `MV` for Marcus Vance).
- Real-time timestamp badges, status pills, and interactive call cards.
