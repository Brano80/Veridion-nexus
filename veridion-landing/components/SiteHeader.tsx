import Link from 'next/link';

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

export default function SiteHeader({ active }: { active?: SiteHeaderActive }) {
  const login = signInHref();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a] border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 min-h-[4rem] items-center justify-between gap-3">
          <Link href="/" className="flex shrink-0 items-center">
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

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3 overflow-x-auto sm:gap-4 md:gap-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className="text-slate-300 hover:text-white transition-colors text-sm whitespace-nowrap"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
