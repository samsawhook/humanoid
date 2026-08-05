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
          <Link href="/tree">Tree</Link>
          <Link href="/week">This week</Link>
          <Link href="/backlog">Backlog</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
