'use client'

/** Sam / Sommer / Combined, for the paycheck cards. Remembers your pick. */

import { useEffect, useState } from 'react'

type Who = 'sam' | 'sommer' | 'both'

export function WhoSwitch({ children }: { children: React.ReactNode }) {
  const [who, setWho] = useState<Who>('sam')
  useEffect(() => {
    try {
      const w = window.localStorage.getItem('paycheck-who') as Who | null
      if (w === 'sam' || w === 'sommer' || w === 'both') setWho(w)
    } catch {}
  }, [])
  const pick = (w: Who) => {
    setWho(w)
    try {
      window.localStorage.setItem('paycheck-who', w)
    } catch {}
  }
  return (
    <div className="whoswitch" data-who={who}>
      <div className="seg rb-who" role="group" aria-label="Whose paychecks">
        {(
          [
            ['sam', 'Sam'],
            ['sommer', 'Sommer'],
            ['both', 'Combined'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={who === k ? 'on' : ''} onClick={() => pick(k)}>
            {label}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
