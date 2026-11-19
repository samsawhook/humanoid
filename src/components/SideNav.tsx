'use client'

/**
 * The one menu: an icon rail down the left of every page. Money's views first (home is the
 * paycheck view), then the other pages. Hover an icon for its name.
 */

import Link from 'next/link'
import type { Route } from 'next'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type Item = { href: string; label: string; icon: React.ReactNode }

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const MONEY: Item[] = [
  {
    href: '/#paychecks',
    label: 'Paychecks',
    icon: svg(
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v5M18 9.5v5" />
      </>,
    ),
  },
  {
    href: '/#scenarios',
    label: 'Return scenarios',
    icon: svg(
      <>
        <path d="M12 21v-7" />
        <path d="M12 14 6 8M12 14l6-6" />
        <path d="M3.5 8.5 6 6l2.5 2.5M15.5 8.5 18 6l2.5 2.5" />
      </>,
    ),
  },
  {
    href: '/#balances',
    label: 'Balance sheet',
    icon: svg(
      <>
        <path d="M12 4v16M7 20h10" />
        <path d="M5 7h14" />
        <path d="M5 7 2.5 13a2.6 2.6 0 0 0 5 0L5 7ZM19 7l-2.5 6a2.6 2.6 0 0 0 5 0L19 7Z" />
      </>,
    ),
  },
  {
    href: '/#briefing',
    label: 'Briefing & detail',
    icon: svg(
      <>
        <rect x="5" y="4.5" width="14" height="17" rx="2" />
        <path d="M9 3h6v3H9z" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
      </>,
    ),
  },
]

const PAGES: Item[] = [
  {
    href: '/overview',
    label: 'Overview',
    icon: svg(
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>,
    ),
  },
  {
    href: '/tree',
    label: 'Goals',
    icon: svg(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>,
    ),
  },
  {
    href: '/plan',
    label: 'Law & MAcc',
    icon: svg(
      <>
        <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" />
        <path d="M6.5 11v4.5c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2V11" />
        <path d="M21.5 9v5" />
      </>,
    ),
  },
  {
    href: '/week',
    label: 'This week',
    icon: svg(
      <>
        <path d="M9 6.5h11M9 12h11M9 17.5h11" />
        <path d="m3.5 6.5 1.3 1.3 2.2-2.6M3.5 12l1.3 1.3 2.2-2.6M3.5 17.5l1.3 1.3 2.2-2.6" />
      </>,
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: svg(
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>,
    ),
  },
]

export function SideNav() {
  const pathname = usePathname()
  const [hash, setHash] = useState('')
  useEffect(() => {
    const read = () => setHash(window.location.hash.slice(1))
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [pathname])
  const onMoney = pathname === '/' || pathname === '/money'
  const active = (it: Item) => {
    if (it.href.startsWith('/#')) return onMoney && (hash || 'paychecks') === it.href.slice(2)
    return pathname === it.href
  }
  const link = (it: Item) => {
    const props = { className: active(it) ? 'on' : '', 'aria-label': it.label, title: it.label, 'aria-current': active(it) ? ('page' as const) : undefined }
    const body = (
      <>
        {it.icon}
        <span className="rail-label">{it.label}</span>
      </>
    )
    // The money views switch by #hash: a plain link, so the browser fires hashchange (on
    // the home page that swaps the view in place; elsewhere it loads the home page there).
    if (it.href.startsWith('/#'))
      return (
        <a key={it.href} href={onMoney ? it.href.slice(1) : it.href} {...props}>
          {body}
        </a>
      )
    return (
      <Link key={it.href} href={it.href as Route} {...props}>
        {body}
      </Link>
    )
  }
  return (
    <nav className="rail" aria-label="Menu">
      {MONEY.map(link)}
      <i className="rail-sep" aria-hidden />
      {PAGES.map(link)}
    </nav>
  )
}
