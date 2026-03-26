'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Globe, FileText, Shield, ClipboardCheck, List, MapPin, Settings, LogOut, Cpu, Activity } from 'lucide-react';
import { getCurrentUser, isAdmin, getAuthHeaders, clearAuthState, CurrentUser } from '../utils/api';

const navItems = [
  { href: '/', label: 'Sovereign Shield', icon: Globe },
  { href: '/review-queue', label: 'Review Queue', icon: ClipboardCheck },
  { href: '/scc-registry', label: 'SCC Registry', icon: FileText },
  { href: '/adequate-countries', label: 'Adequate Countries', icon: MapPin },
  { href: '/transfer-log', label: 'Transfer Log', icon: List },
  { href: '/evidence-vault', label: 'Evidence Vault', icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch { /* ignore */ }
    clearAuthState();
    window.location.href = '/login';
  }

  return (
    <div className="w-56 bg-slate-800 border-r border-slate-700 h-screen fixed left-0 top-0 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 flex-1 overflow-y-auto min-h-0">
        <div className="mb-6">
          <h1 className="flex items-baseline gap-1 mb-0.5" style={{ fontFamily: "Inter, sans-serif" }}>
            <span className="text-lg font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
            <span className="text-sm font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
          </h1>
          <p className="text-[10px] text-slate-400">Compliance Dashboard v1.0.0</p>
        </div>
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
          <div className="border-t border-slate-700 mt-4 mb-1.5" />
          {/* ACM section: heading + nav links removed; structure preserves spacing between dividers */}
          <div className="px-2 py-0.5 min-h-[1.125rem]" aria-hidden />
          <div className="flex min-h-[2.25rem] items-center px-2 py-1.5" aria-hidden />
          <div className="flex min-h-[2.25rem] items-center px-2 py-1.5" aria-hidden />
          <div className="border-t border-slate-700 mt-4 mb-1.5" />
          <div className="px-2 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              System
            </span>
          </div>
          <Link
            href="/agents"
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname === '/agents'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            AI System Registry
          </Link>
          <Link
            href="/acm"
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname === '/acm'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            ACM Overview
          </Link>
          {isAdmin(currentUser) && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname?.startsWith('/admin')
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Admin Panel
            </Link>
          )}
        </nav>
        </div>
        {currentUser?.tenant_name ? (
          <div className="shrink-0 px-4 pb-3 pt-1">
            <p
              className="px-2 text-xs text-slate-400 leading-snug line-clamp-2 break-words"
              title={currentUser.tenant_name}
            >
              {currentUser.tenant_name}
            </p>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 p-3 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors w-full"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
