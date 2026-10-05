/**
 * Parser „RAPORT ZMIANY OKRESOWY” (SMALL BUSINESS 5.21) na podstawie pozycji słów.
 *
 * Nie zakłada stałych współrzędnych: kolumny „Ilość” / „Wartość” wyznaczane są
 * z nagłówka „Opis Ilość Wartość” na każdej stronie, a liczby z separatorem
 * tysięcy w postaci spacji („79 871,77”) składane są z tokenów leżących blisko siebie.
 */
import { posKeyOf } from './normalize'
import type { ParseResult, PosReport, ReportGroup, ReportPosition, TextItem } from './types'

interface Word {
  text: string
  x0: number
  x1: number
}

interface Line {
  page: number
  y: number
  words: Word[]
}

interface Columns {
  /** Lewa krawędź nagłówka „Ilość”: liczby kończące się na lewo od niej należą do nazwy. */
  qtyLeft: number
  /** Granica między prawymi krawędziami liczb z kolumn „Ilość” i „Wartość”. */
  qtyValueSplit: number
}

interface ParsedLine {
  /** Słowa nazwy (w tym liczby leżące na lewo od kolumny „Ilość”). */
  name: string[]
  qty: number | null
  value: number | null
}

const NUMERIC = /^-?\d+(?:[.,]\d+)?$/
const DIGITS = /^-?\d+$/
const MERGE_GAP_FACTOR = 1.6
const Y_TOLERANCE = 1

/** Rozbija fragmenty tekstu na słowa z pozycjami (czcionka raportu jest o stałej szerokości). */
function toWords(items: TextItem[]): { page: number; y: number; word: Word; charWidth: number }[] {
  const out: { page: number; y: number; word: Word; charWidth: number }[] = []
  for (const it of items) {
    if (!it.str.trim() || it.str.length === 0) continue
    const cw = it.width / it.str.length
    for (const m of it.str.matchAll(/\S+/g)) {
      const x0 = it.x + (m.index ?? 0) * cw
      out.push({ page: it.page, y: it.y, word: { text: m[0], x0, x1: x0 + m[0].length * cw }, charWidth: cw })
    }
  }
  return out
}

function groupLines(items: TextItem[]): { lines: Line[]; charWidthByPage: Map<number, number> } {
  const words = toWords(items)
  const cwSum = new Map<number, { sum: number; n: number }>()
  for (const w of words) {
    const s = cwSum.get(w.page) ?? { sum: 0, n: 0 }
    s.sum += w.charWidth
    s.n++
    cwSum.set(w.page, s)
  }
  const charWidthByPage = new Map([...cwSum].map(([p, s]) => [p, s.sum / s.n]))

  words.sort((a, b) => a.page - b.page || b.y - a.y || a.word.x0 - b.word.x0)
  const lines: Line[] = []
  for (const w of words) {
    const last = lines[lines.length - 1]
    if (last && last.page === w.page && Math.abs(last.y - w.y) <= Y_TOLERANCE) last.words.push(w.word)
    else lines.push({ page: w.page, y: w.y, words: [w.word] })
  }
  for (const l of lines) l.words.sort((a, b) => a.x0 - b.x0)
  return { lines, charWidthByPage }
}

function lineText(l: Line): string {
  return l.words.map((w) => w.text).join(' ')
}

function isColumnHeader(l: Line): boolean {
  const t = l.words.map((w) => w.text)
  return t.length === 3 && t[0] === 'Opis' && t[1] === 'Ilość' && t[2] === 'Wartość'
}

function isNumberingRow(l: Line): boolean {
  const t = l.words.map((w) => w.text)
  return t.length === 3 && t[0] === '1' && t[1] === '2' && t[2] === '3'
}

function parseNumber(s: string): number {
  return Number(s.replace(/\s/g, '').replace(',', '.'))
}

/** Dzieli linię na nazwę, ilość i wartość według położenia liczb względem kolumn. */
function parseLine(l: Line, cols: Columns, charWidth: number): ParsedLine {
  // Sklejanie liczb rozbitych spacją tysięcy: „13” + „871,70” → 13871,70.
  const chunks: { words: Word[]; numeric: boolean }[] = []
  for (const w of l.words) {
    const numeric = NUMERIC.test(w.text)
    const prev = chunks[chunks.length - 1]
    const prevLast = prev?.words[prev.words.length - 1]
    if (
      numeric &&
      prev?.numeric &&
      prevLast &&
      DIGITS.test(prevLast.text) &&
      w.x0 - prevLast.x1 < MERGE_GAP_FACTOR * charWidth
    ) {
      prev.words.push(w)
    } else {
      chunks.push({ words: [w], numeric })
    }
  }

  const res: ParsedLine = { name: [], qty: null, value: null }
  for (const c of chunks) {
    const right = c.words[c.words.length - 1].x1
    if (!c.numeric || right < cols.qtyLeft) {
      res.name.push(...c.words.map((w) => w.text))
      continue
    }
    const n = parseNumber(c.words.map((w) => w.text).join(''))
    if (right <= cols.qtyValueSplit) res.qty = n
    else res.value = n
  }
  return res
}

function toIsoDate(d: string): string {
  const [dd, mm, yyyy] = d.split('.')
  return `${yyyy}-${mm}-${dd}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function lastDayOfMonth(yyyy: number, mm: number): number {
  return new Date(Date.UTC(yyyy, mm, 0)).getUTCDate()
}

export function parseReportItems(items: TextItem[], zrodlo?: string): ParseResult {
  const { lines, charWidthByPage } = groupLines(items)
  const errors: string[] = []
  const warnings: string[] = []

  let cols: Columns | null = null
  let colsPage = -1
  let section: 'naglowek' | 'grupy' | 'towary' | 'koniec' = 'naglowek'

  let zakres: { od: string; do: string; tekst: string } | null = null
  let ogolem: number | null = null
  let razem: number | null = null
  const grupy: ReportGroup[] = []
  const pozycje: ReportPosition[] = []
  let currentGroup: number | null = null

  for (const l of lines) {
    if (l.page !== colsPage) {
      // Nagłówek kolumn jest na górze każdej strony; jeśli go brak, zostają kolumny z poprzedniej.
      const header = lines.find((h) => h.page === l.page && isColumnHeader(h))
      if (header) {
        const [, ilosc, wartosc] = header.words
        cols = { qtyLeft: ilosc.x0, qtyValueSplit: (ilosc.x1 + wartosc.x1) / 2 }
      }
      colsPage = l.page
    }
    if (isColumnHeader(l) || isNumberingRow(l)) continue
    const text = lineText(l)
    if (/^-{5,}$/.test(text)) continue
    if (!cols) continue
    const cw = charWidthByPage.get(l.page) ?? 3.5

    if (text.startsWith('Sprzedaż wg grup')) {
      section = 'grupy'
      continue
    }
    if (text.startsWith('Sprzedaż wg towarów')) {
      section = 'towary'
      continue
    }
    if (section === 'towary' && /^(Sprzedaż wg|Operator)/.test(text)) {
      section = 'koniec'
      continue
    }

    if (section === 'naglowek') {
      const m = text.match(/zakres dat:\s*(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/)
      if (m && !zakres) zakres = { od: toIsoDate(m[1]), do: toIsoDate(m[2]), tekst: `${m[1]} - ${m[2]}` }
      if (l.words[0].text === 'Ogółem' && ogolem === null) ogolem = parseLine(l, cols, cw).value
      continue
    }

    if (section === 'grupy') {
      const p = parseLine(l, cols, cw)
      if (p.name[0] === 'Grupa' && p.name.length >= 2) {
        grupy.push({
          nr: Number(p.name[1]),
          nazwa: p.name.slice(2).join(' '),
          ilosc: p.qty ?? 0,
          wartosc: p.value ?? 0,
          rabat: 0,
        })
      } else if (p.name[0] === 'rabat' && grupy.length) {
        grupy[grupy.length - 1].rabat = p.value ?? 0
      } else if (text.startsWith('Razem sprzedaż wg grup')) {
        razem = p.value
      }
      continue
    }

    if (section === 'towary') {
      const p = parseLine(l, cols, cw)
      if (p.name[0] === 'Grupa' && p.qty === null && p.value === null && DIGITS.test(p.name[1] ?? '')) {
        currentGroup = Number(p.name[1])
        continue
      }
      if (currentGroup === null) {
        errors.push(`Pozycja „${text}” przed nagłówkiem grupy.`)
        continue
      }
      const nazwa = p.name.join(' ')
      pozycje.push({
        posKey: posKeyOf(currentGroup, nazwa),
        grupa: currentGroup,
        nazwa,
        ilosc: p.qty ?? 0,
        wartosc: p.value ?? 0,
      })
    }
  }

  if (!zakres) errors.push('Nie znaleziono „zakres dat” — to nie wygląda na raport okresowy z kasy.')
  if (ogolem === null) errors.push('Nie znaleziono kwoty „Ogółem”.')
  if (razem === null) errors.push('Nie znaleziono „Razem sprzedaż wg grup”.')
  if (!grupy.length) errors.push('Nie znaleziono sekcji „Sprzedaż wg grup”.')
  if (!pozycje.length) errors.push('Nie znaleziono sekcji „Sprzedaż wg towarów”.')
  if (!zakres || ogolem === null || razem === null) return { ok: false, errors, warnings }

  const [y, m] = zakres.od.split('-').map(Number)
  const report: PosReport = {
    zakresTekst: zakres.tekst,
    od: zakres.od,
    do: zakres.do,
    miesiac: zakres.od.slice(0, 7),
    ogolem,
    razemWgGrup: razem,
    grupy,
    pozycje,
    zrodlo,
  }

  const v = validateReport(report)
  errors.push(...v.errors)
  warnings.push(...v.warnings)

  const fullMonth =
    zakres.od === `${zakres.od.slice(0, 7)}-01` &&
    zakres.do === `${zakres.od.slice(0, 7)}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`
  if (!fullMonth) warnings.push(`Zakres dat ${zakres.tekst} nie obejmuje pełnego miesiąca.`)

  return errors.length ? { ok: false, errors, warnings, report } : { ok: true, report, warnings }
}

const TOLERANCE = 0.01 + 1e-9

export function validateReport(r: PosReport): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const fmt = (n: number) => n.toFixed(2).replace('.', ',')

  for (const g of r.grupy) {
    const suma = round2(r.pozycje.filter((p) => p.grupa === g.nr).reduce((s, p) => s + p.wartosc, 0))
    if (Math.abs(suma - g.wartosc) > TOLERANCE)
      errors.push(`Grupa ${g.nr} „${g.nazwa}”: suma pozycji ${fmt(suma)} ≠ wartość grupy ${fmt(g.wartosc)}.`)
  }
  const known = new Set(r.grupy.map((g) => g.nr))
  for (const nr of new Set(r.pozycje.map((p) => p.grupa)))
    if (!known.has(nr)) errors.push(`Pozycje w grupie ${nr}, której nie ma w „Sprzedaż wg grup”.`)

  const sumaGrup = round2(r.grupy.reduce((s, g) => s + g.wartosc, 0))
  if (Math.abs(sumaGrup - r.razemWgGrup) > TOLERANCE)
    errors.push(`Suma grup ${fmt(sumaGrup)} ≠ „Razem sprzedaż wg grup” ${fmt(r.razemWgGrup)}.`)

  const diff = round2(r.ogolem - r.razemWgGrup)
  if (Math.abs(diff) > TOLERANCE)
    warnings.push(
      `„Ogółem” (${fmt(r.ogolem)}) różni się od „Razem wg grup” (${fmt(r.razemWgGrup)}) o ${diff > 0 ? '+' : ''}${fmt(diff)} zł. To informacja z kasy, nie błąd.`,
    )
  return { errors, warnings }
}
