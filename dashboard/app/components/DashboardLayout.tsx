'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TrialExpiredModal from './TrialExpiredModal';
import { onTrialExpired } from '../utils/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    onTrialExpired(() => setTrialExpired(true));
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-900">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">{children}</main>
      {trialExpired && <TrialExpiredModal />}
    </div>
  );
}
