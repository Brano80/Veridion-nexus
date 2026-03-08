import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sovereign Shield — EU Compliance API',
  description: 'GDPR data transfer monitoring and compliance tooling supporting demonstrable compliance',
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
      <body className="bg-slate-900 antialiased">{children}</body>
    </html>
  )
}
