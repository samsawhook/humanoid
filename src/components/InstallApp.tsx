'use client'

import { useEffect, useState } from 'react'

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/**
 * Install the app from the menu: one click where the browser allows it (Chrome, Edge),
 * the steps where it does not (Safari, iPhone), and the reason when it cannot install
 * here at all — so "I don't see it" has an answer.
 */
export function InstallApp() {
  const [deferred, setDeferred] = useState<Prompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState<string[]>([])

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    if (standalone) setInstalled(true)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as Prompt)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const diagnose = async () => {
    const ua = navigator.userAgent
    const notes: string[] = []
    const ios = /iPhone|iPad|iPod/.test(ua)
    const safari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|FxiOS|Firefox/.test(ua)
    const firefox = /Firefox|FxiOS/.test(ua)
    if (ios) notes.push('iPhone/iPad: tap Share (the square with the arrow) → “Add to Home Screen”. iPhones never show an install button.')
    else if (safari) notes.push('Safari on a Mac: File → “Add to Dock”.')
    else if (firefox) notes.push('Firefox does not install web apps on a desktop. Open this page in Chrome or Edge.')
    else notes.push('Chrome or Edge: the browser has not offered an install yet. Try the ⋮ menu → “Cast, save and share” → “Install page as app…” (Edge: ⋯ → Apps → “Install this site as an app”).')
    if (!window.isSecureContext) notes.push(`This address (${location.origin}) is not secure. Installing needs https:// — or localhost on your own computer.`)
    if (window.self !== window.top) notes.push('This page is open inside another app’s panel. Open it in a normal browser tab to install.')
    try {
      const r = await fetch('/manifest.webmanifest', { cache: 'no-store' })
      if (!r.ok) notes.push(`The install file did not load here (status ${r.status}) — the host may be password-protecting it (on Vercel: turn off Deployment Protection for this address, and use DASH_PASSWORD instead).`)
    } catch {
      notes.push('The install file could not be loaded — check the connection.')
    }
    setWhy(notes)
    setOpen(true)
  }

  const click = async () => {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      return
    }
    if (open) setOpen(false)
    else void diagnose()
  }

  if (installed) return null
  return (
    <div className="install-app">
      <button type="button" onClick={click} aria-label="Install the app" title={deferred ? 'Install Life Dash as an app' : 'How to install Life Dash'} className={deferred ? 'ready' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
          <path d="M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
        </svg>
        <span className="rail-label">Install app</span>
      </button>
      {open && (
        <div className="install-pop" role="dialog" aria-label="Install Life Dash">
          <b>Install Life Dash</b>
          <ul>
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button type="button" className="linkish" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
