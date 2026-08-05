/**
 * ICS generation. Pure string building — no database, no network.
 *
 * Firm blocks export as ordinary events. Soft blocks are prefixed `~` so the phone
 * shows the intended shape of the day without implying commitment, because any
 * re-slot may rewrite their times. One all-day event per day carries the ordered
 * queue as text, so the plan stays readable even when the soft times are stale.
 */

import type { LocalDate } from '../types'
import type { DaySlotting } from './reslot'

/** RFC 5545 escaping: backslash, semicolon, comma, newline. Order matters. */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function stampDate(date: LocalDate): string {
  return date.replace(/-/g, '')
}

/**
 * Fold lines at 75 octets per RFC 5545. Calendar clients genuinely reject long lines,
 * and a title with a long node name will exceed it.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export interface IcsOptions {
  calendarName?: string
  /** Stable per-installation, so events update rather than duplicate on refresh. */
  uidNamespace?: string
  /** Passed in rather than read from the clock, so output is deterministic. */
  now?: Date
}

export function buildIcs(
  days: DaySlotting[],
  queueTitles: Record<LocalDate, string[]> = {},
  options: IcsOptions = {},
): string {
  const {
    calendarName = 'Life Dash',
    uidNamespace = 'life-dash',
    now = new Date(0),
  } = options

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(calendarName)}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
  ]

  for (const day of days) {
    for (const block of day.blocks) {
      const soft = block.firmness === 'soft'
      const key = block.itemId ?? block.commitmentId ?? 'block'
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uidNamespace}-${day.localDate}-${key}@life-dash`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(block.start)}`,
        `DTEND:${stamp(block.end)}`,
        fold(`SUMMARY:${esc(soft ? `~ ${block.title}` : block.title)}`),
        soft
          ? 'DESCRIPTION:Provisional. Any re-slot may move this.'
          : 'DESCRIPTION:Firm block.',
        soft ? 'TRANSP:TRANSPARENT' : 'TRANSP:OPAQUE',
        'END:VEVENT',
      )
    }

    const queue = queueTitles[day.localDate]
    if (queue && queue.length > 0) {
      const body = queue.map((t, i) => `${i + 1}. ${t}`).join('\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uidNamespace}-${day.localDate}-queue@life-dash`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${stampDate(day.localDate)}`,
        `DTEND;VALUE=DATE:${stampDate(nextDay(day.localDate))}`,
        fold(`SUMMARY:${esc(`Queue — ${queue.length} item(s)`)}`),
        fold(`DESCRIPTION:${esc(body)}`),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function nextDay(date: LocalDate): LocalDate {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000)
  return d.toISOString().slice(0, 10)
}
