import type { Metadata, Viewport } from 'next'
import { SideNav } from '@/components/SideNav'
import { RegisterSW } from '@/components/RegisterSW'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Dash',
  description: 'Single-user life planning across the full horizon.',
  applicationName: 'Life Dash',
  appleWebApp: { capable: true, title: 'Life Dash', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = { themeColor: '#0c0e12', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        <SideNav />
        <main>{children}</main>
      </body>
    </html>
  )
}
