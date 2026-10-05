import type { Jednostka } from './domain/types'

const NBSP = ' '

/** `1234.5` → `1 234,50` (spacja tysięcy także dla liczb 4-cyfrowych). */
export function fmtNum(n: number, decimals = 2, trimZeros = false): string {
  if (!Number.isFinite(n)) return '—'
  let s = Math.abs(n).toFixed(decimals)
  if (trimZeros && s.includes('.')) s = s.replace(/\.?0+$/, '')
  const [int, frac] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const sign = n < 0 && Number(s) !== 0 ? '−' : ''
  return sign + grouped + (frac ? ',' + frac : '')
}

export const fmtZl = (n: number) => `${fmtNum(n, 2)}${NBSP}zł`

export function fmtQty(n: number, j: Jednostka): string {
  if (j === 'kg') return fmtNum(n, 3)
  if (j === 'butelka') return fmtNum(n, 2, true)
  return fmtNum(n, 2, true)
}

export const unitLabel = (j: Jednostka) => (j === 'butelka' ? 'but.' : j)

export const fmtPct = (n: number) => `${fmtNum(n * 100, 1)}${NBSP}%`

export function fmtSigned(s: string, n: number): string {
  return n > 0 ? `+${s}` : s
}

const MIESIACE = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
]

export function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return `${MIESIACE[mm - 1]} ${y}`
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return 'nigdy'
  const d = new Date(iso)
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}
