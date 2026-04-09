import type { Metadata } from 'next'
import './globals.css'
import SiteHeader from '@/components/SiteHeader'

export const metadata: Metadata = {
  metadataBase: new URL('https://veridion-nexus.eu'),
  title: 'Veridion Nexus — EU GDPR Compliance API',
  description: 'GDPR data transfer monitoring and compliance tooling supporting demonstrable compliance',
  keywords: ['GDPR', 'data transfer', 'compliance', 'EU', 'API', 'Sovereign Shield', 'international transfers', 'Chapter V'],
  authors: [{ name: 'Veridion' }],
  openGraph: {
    title: 'Veridion Nexus — EU GDPR Compliance API',
    description: 'GDPR data transfer monitoring and compliance tooling supporting demonstrable compliance',
    url: 'https://veridion-nexus.eu',
    siteName: 'Veridion Nexus',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Veridion Nexus — EU GDPR Compliance API',
    description: 'GDPR data transfer monitoring and compliance tooling supporting demonstrable compliance',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-900 antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  )
}
