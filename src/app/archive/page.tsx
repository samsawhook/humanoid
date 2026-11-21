import Link from 'next/link'
import type { Route } from 'next'

/** Pages off the menu, still working. */
const ARCHIVED: { href: string; label: string; note: string }[] = [
  { href: '/#briefing', label: 'Briefing & detail', note: 'Attention items, advice and the working behind the plan' },
  { href: '/overview', label: 'Overview', note: 'The dashboard of everything' },
  { href: '/tree', label: 'Goals', note: 'The goal tree' },
  { href: '/plan', label: 'Law & MAcc', note: 'The schools compared' },
  { href: '/week', label: 'This week', note: 'The weekly list' },
  { href: '/jd', label: 'JD', note: 'Law school detail' },
]

export default function ArchivePage() {
  return (
    <main>
      <h1>Archive</h1>
      <p className="sub">Off the menu, but still here.</p>
      <div className="archive-list">
        {ARCHIVED.map((a) =>
          a.href.startsWith('/#') ? (
            <a key={a.href} href={a.href}>
              {a.label}
              <span>{a.note}</span>
            </a>
          ) : (
            <Link key={a.href} href={a.href as Route}>
              {a.label}
              <span>{a.note}</span>
            </Link>
          ),
        )}
      </div>
    </main>
  )
}
