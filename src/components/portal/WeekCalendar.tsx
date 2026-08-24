'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import styles from './WeekCalendar.module.css'

export type WeekCalendarChip = {
  id: string
  href: string
  title: string
  meta: string | null
  platforms: string[]
  stateNote: string | null
  syncLabel: string | null
  accent: 'yellow' | 'graphite' | 'grey'
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (value: number) => String(value).padStart(2, '0')

function utcDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function mondayOf(iso: string): string {
  const date = utcDate(iso)
  const weekday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - weekday)
  return isoDate(date)
}

export function addCalendarDays(iso: string, days: number): string {
  const date = utcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

function rangeLabel(weekStart: string): string {
  const start = utcDate(weekStart)
  const end = utcDate(addCalendarDays(weekStart, 6))
  const startLabel = `${MONTHS_SHORT[start.getUTCMonth()]} ${start.getUTCDate()}`
  const endLabel = `${MONTHS_SHORT[end.getUTCMonth()]} ${end.getUTCDate()}`
  return `${startLabel} to ${endLabel}`
}

export default function WeekCalendar({
  days,
  todayIso,
  label = 'This week',
  headingLevel = 3,
}: {
  days: Record<string, WeekCalendarChip[]>
  todayIso: string
  label?: string
  headingLevel?: 2 | 3
}) {
  const currentWeek = mondayOf(todayIso)
  const [weekStart, setWeekStart] = useState(currentWeek)
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index)), [weekStart])
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <section className={styles.wrap} aria-label={`${label} content calendar`}>
      <div className={styles.head}>
        <div>
          <HeadingTag className={styles.title}>{label}</HeadingTag>
          <p className={styles.range} aria-live="polite">{rangeLabel(weekStart)}</p>
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.navButton} onClick={() => setWeekStart(addCalendarDays(weekStart, -7))} aria-label="Previous week">&#8249;</button>
          <button type="button" className={styles.navButton} onClick={() => setWeekStart(addCalendarDays(weekStart, 7))} aria-label="Next week">&#8250;</button>
        </div>
      </div>
      <div className={styles.days}>
        {dates.map((date, index) => {
          const dayChips = days[date] ?? []
          const value = utcDate(date)
          const isToday = date === todayIso
          return (
            <div key={date} className={isToday ? `${styles.day} ${styles.today}` : styles.day}>
              <div className={styles.dayHead}>
                <span className={styles.weekday}>{WEEKDAY[index]}</span>
                <time className={styles.date} dateTime={date}>{MONTHS_SHORT[value.getUTCMonth()]} {value.getUTCDate()}</time>
              </div>
              {dayChips.length > 0 && (
                <div className={styles.chips}>
                  {dayChips.map((chip) => (
                    <Link key={chip.id} href={chip.href} className={`${styles.chip} ${styles[`accent_${chip.accent}`]}`}>
                      <span className={styles.chipTitle}>{chip.title}</span>
                      {chip.meta && <span className={styles.chipMeta}>{chip.meta}</span>}
                      {chip.platforms.length > 0 && <span className={styles.chipPlatforms}>{chip.platforms.join(' · ')}</span>}
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
