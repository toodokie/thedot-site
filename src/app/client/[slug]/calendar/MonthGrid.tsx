'use client'
import { useState } from 'react'
import Link from 'next/link'
import styles from './calendar.module.css'

// The primary calendar view: ONE regular month grid (Monday-start), defaulting to the
// current month (the server passes the request-time date in the business timezone), with
// accessible previous/next month buttons around the month title. Event chips render
// inside the day cells; on narrow screens the chips collapse to colour bars (the by-week
// list below the grid carries the detail on mobile) so the grid never scrolls sideways.

export type CalendarChip = {
  id: string
  href: string
  title: string
  meta: string | null
  platforms: string[]
  stateNote: string | null
  syncLabel: string | null
  accent: 'yellow' | 'graphite' | 'grey'
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
// Monday-start week to match Kanset's business-week cadence.
const WEEK_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`

// One month's calendar cells (Monday-start): leading blanks, the days, trailing blanks.
function monthCells(year: number, month: number): (number | null)[] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function MonthGrid({
  days,
  todayIso,
}: {
  days: Record<string, CalendarChip[]>
  todayIso: string // YYYY-MM-DD, request-time, business timezone
}) {
  const [currentYear, currentMonth1] = todayIso.split('-').map(Number)
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth1 - 1) // 0-based

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }
  const onCurrentMonth = year === currentYear && month === currentMonth1 - 1

  const cells = monthCells(year, month)

  return (
    <section className={styles.monthBlock} aria-label="Content calendar month view">
      <div className={styles.monthNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => step(-1)}
          aria-label="Previous month"
        >
          &#8249;
        </button>
        <h3 className={styles.monthTitle} aria-live="polite">
          {MONTHS[month]} {year}
        </h3>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => step(1)}
          aria-label="Next month"
        >
          &#8250;
        </button>
        {!onCurrentMonth && (
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => { setYear(currentYear); setMonth(currentMonth1 - 1) }}
          >
            This month
          </button>
        )}
      </div>

      <div className={styles.gridHead}>
        {WEEK_HEAD.map((w) => <div key={w} className={styles.gridHeadCell}>{w}</div>)}
      </div>
      <div className={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`b-${i}`} className={`${styles.cell} ${styles.cellBlank}`} />
          const key = isoOf(year, month + 1, day)
          const dayChips = days[key] ?? []
          const isToday = key === todayIso
          return (
            <div key={key} className={isToday ? `${styles.cell} ${styles.today}` : styles.cell}>
              <div className={styles.dayNum}>{day}</div>
              {dayChips.length > 0 && (
                <div className={styles.chips}>
                  {dayChips.map((chip) => (
                    <Link
                      key={chip.id}
                      href={chip.href}
                      aria-label={chip.title}
                      className={`${styles.chip} ${styles[`accent_${chip.accent}`]}`}
                    >
                      <span className={styles.chipTitle}>{chip.title}</span>
                      {chip.meta && <span className={styles.chipMeta}>{chip.meta}</span>}
                      {chip.platforms.length > 0 && (
                        <span className={styles.chipPlatforms}>
                          {chip.platforms.map((p) => <span key={p} className={styles.plat}>{p}</span>)}
                        </span>
                      )}
                      {chip.stateNote && <span className={styles.chipMeta}>{chip.stateNote}</span>}
                      {chip.syncLabel && <span className={styles.chipMeta}>{chip.syncLabel}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
