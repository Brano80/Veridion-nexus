'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SiteHeaderActive = 'docs' | 'spec' | 'registry' | 'home';

function signInHref(): string {
  return process.env.NEXT_PUBLIC_DASHBOARD_URL &&
    !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost')
    ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`
    : 'https://app.veridion-nexus.eu/login';
}

function linkClass(active: boolean): string {
  return active
    ? 'text-emerald-400 font-medium transition-colors text-sm whitespace-nowrap'
    : 'text-slate-300 hover:text-white transition-colors text-sm whitespace-nowrap';
}

function activeFromPath(pathname: string | null): SiteHeaderActive | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith('/docs')) return 'docs';
  if (pathname.startsWith('/spec')) return 'spec';
  if (pathname.startsWith('/registry')) return 'registry';
  if (pathname === '/') return 'home';
  return undefined;
}

/**
 * Global top nav — rendered from `app/layout.tsx` so it is not nested under
 * client-only page trees (avoids hydration / stacking issues on the homepage).
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const active = activeFromPath(pathname);
  const login = signInHref();

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] border-b border-slate-700/90 bg-slate-950/95 shadow-lg shadow-black/40 backdrop-blur-md supports-[backdrop-filter]:bg-slate-950/80">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main">
        <div className="flex h-16 min-h-[4rem] w-full min-w-0 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center">
            <span className="flex items-baseline gap-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>
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
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-3 overflow-x-auto sm:gap-4 md:gap-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/docs" className={linkClass(active === 'docs')}>
              Documentation
            </Link>
            <Link href="/spec" className={linkClass(active === 'spec')}>
              Spec
            </Link>
            <a
              href={login}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors text-sm whitespace-nowrap"
            >
              Sign In
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
