# Veridion Nexus Dashboard

Product UI for monitoring and managing compliance decisions.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The dashboard will run on **http://localhost:3000**

## Prerequisites

- The Rust API must be running on **http://localhost:8080**
- Ensure the API is accessible and CORS is configured to allow requests from `http://localhost:3000`

## Features

### 1. Transfer Decisions (Default)
- Live feed of ALLOW/BLOCK/REVIEW decisions
- Real-time stats: total today, % blocked, % allowed, pending review count
- Filter by decision type
- Auto-refreshes every 5 seconds

### 2. SCC Registry
- View all Standard Contractual Clause entries
- Add new SCC entries
- Expired entries highlighted in red

### 3. Evidence Vault
- List of sealed events with SHA-256 hashes
- Chain integrity verification
- Shows sequence numbers and linked decisions

### 4. Review Queue
- Pending REVIEW decisions requiring human oversight
- Approve/Reject actions
- Auto-refreshes every 5 seconds

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Dark theme (slate-900)
