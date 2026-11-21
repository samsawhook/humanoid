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
    href: '/#planner',
    label: 'Planner',
    icon: svg(
      <>
        <path d="M3.5 19.5h17" />
        <path d="M5 16l4-5 3.5 3 6.5-8" />
        <path d="M16 6h3v3" />
      </>,
    ),
  },
  {
    href: '/#home',
    label: 'Back-home budget',
    icon: svg(
      <>
        <path d="M3.5 11 12 4l8.5 7" />
        <path d="M5.5 9.5V20h13V9.5" />
        <path d="M12 12.5v5M10 14h3a1.5 1.5 0 0 1 0 3h-2" />
      </>,
    ),
  },
]

const PAGES: Item[] = [
  {
    href: '/todo',
    label: 'To-do',
    icon: svg(
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8 12 2.5 2.5L16 9" />
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
  {
    href: '/archive',
    label: 'Archive',
    icon: svg(
      <>
        <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />
        <path d="M5 9v10.5h14V9" />
        <path d="M10 13h4" />
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
