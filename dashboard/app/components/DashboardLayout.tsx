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
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ss_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setAuthChecked(true);
    onTrialExpired(() => setTrialExpired(true));
  }, []);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen bg-slate-900 items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-900">
      <Sidebar />
      <main className="flex-1 ml-56 p-4">{children}</main>
      {trialExpired && <TrialExpiredModal />}
    </div>
  );
}
