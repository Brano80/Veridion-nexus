'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export type SiteHeaderActive = 'docs' | 'spec' | 'registry' | 'home';

function signInHref(): string {
  return process.env.NEXT_PUBLIC_DASHBOARD_URL &&
    !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost')
    ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`
    : 'https://app.veridion-nexus.eu/login';
}

function linkClass(active: boolean): string {
  return active
    ? 'text-emerald-400 font-medium transition-colors text-sm'
    : 'text-slate-300 hover:text-white transition-colors text-sm';
}

export default function SiteHeader({ active }: { active?: SiteHeaderActive }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const login = signInHref();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const close = () => setMobileMenuOpen(false);
    mq.addEventListener('change', close);
    return () => mq.removeEventListener('change', close);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 overflow-visible bg-[#0f172a] border-b border-slate-800">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
              <span
                className="text-xl font-black italic uppercase text-white"
                style={{ letterSpacing: '-0.05em', lineHeight: 0.85 }}
              >
                VERIDION
              </span>
              <span
                className="text-base font-semibold italic lowercase"
                style={{
                  color: '#10b981',
                  letterSpacing: '-0.02em',
                  filter: 'drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))',
                }}
              >
                nexus
              </span>
            </h1>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/docs" className={linkClass(active === 'docs')}>
              Documentation
            </Link>
            <Link href="/spec" className={linkClass(active === 'spec')}>
              Spec
            </Link>
            <Link href="/registry" className={linkClass(active === 'registry')}>
              Registry
            </Link>
            <a
              href={login}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors text-sm"
            >
              Sign In
            </a>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <>
            <button
              type="button"
              className="fixed left-0 right-0 top-16 bottom-0 z-[90] bg-slate-950/60 md:hidden"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div
              className="md:hidden fixed right-4 top-16 z-[100] mt-1 flex min-w-[12rem] max-w-[calc(100vw-2rem)] flex-col items-end gap-3 rounded-lg border border-slate-800 bg-[#0f172a] py-4 pl-6 pr-4 shadow-xl text-right sm:right-6 lg:right-8"
              role="dialog"
              aria-label="Main menu"
            >
            <Link
              href="/docs"
              className="block w-full text-sm text-slate-300 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Documentation
            </Link>
            <Link
              href="/spec"
              className="block w-full text-sm text-slate-300 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Spec
            </Link>
            <Link
              href="/registry"
              className="block w-full text-sm text-slate-300 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Registry
            </Link>
            <a
              href={login}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-sm text-slate-300 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign In
            </a>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
