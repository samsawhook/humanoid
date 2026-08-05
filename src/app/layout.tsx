import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Dash',
  description: 'Single-user life planning across the full horizon.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Overview</Link>
          <Link href="/money">Money</Link>
          <Link href="/tree">Goals</Link>
          <Link href="/plan">Law &amp; MAcc</Link>
          <Link href="/calendar">Calendar</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
