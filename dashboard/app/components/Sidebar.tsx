'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Globe, FileText, Shield, ClipboardCheck, List, MapPin, Settings } from 'lucide-react';
import { getCurrentUser, isAdmin, CurrentUser } from '../utils/api';

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

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-6">
        <div className="mb-8">
          <h1 className="flex items-baseline gap-1.5 mb-1" style={{ fontFamily: "Inter, sans-serif" }}>
            <span className="text-xl font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
            <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
          </h1>
          <p className="text-xs text-slate-400">Compliance Dashboard v1.0.0</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
          {isAdmin(currentUser) && (
            <>
              <div className="border-t border-slate-700 my-2" />
              <div className="px-3 py-1">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  System
                </span>
              </div>
              <Link
                href="/admin"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Settings className="w-4 h-4" />
                Admin Panel
              </Link>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}
