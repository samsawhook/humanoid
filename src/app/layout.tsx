import type { Metadata } from 'next'
import { SideNav } from '@/components/SideNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Dash',
  description: 'Single-user life planning across the full horizon.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SideNav />
        <main>{children}</main>
      </body>
    </html>
  )
}
