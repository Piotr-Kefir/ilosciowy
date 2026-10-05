import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { normalizeName } from '../src/parser/normalize'
import type { ParseResult } from '../src/parser/types'
import { FIXTURES, parseFixture } from './helpers'

interface Expected {
  zakres: string
  ogolem: number
  razem_wg_grup: number
  grupy: Record<string, { nazwa: string; ilosc: number; wartosc: number; rabat: number }>
  liczba_pozycji_towarow: number
  wybrane_pozycje: Record<string, { group: number; qty: number; value: number }>
}

const expected: Record<string, Expected> = JSON.parse(
  readFileSync(join(FIXTURES, 'expected_parser_values.json'), 'utf8'),
)
describe.each(Object.keys(expected))('raport %s', (miesiac) => {
  const exp = expected[miesiac]
  let res: ParseResult

  beforeAll(async () => {
    res = await parseFixture(miesiac)
  })

  it('przechodzi walidację sum', () => {
    expect(res.ok ? [] : res.errors).toEqual([])
  })

  it('zakres, Ogółem, Razem wg grup, miesiąc', () => {
    if (!res.ok) throw new Error('parse failed')
    const r = res.report
    expect(r.zakresTekst).toBe(exp.zakres)
    expect(r.miesiac).toBe(miesiac)
    expect(r.ogolem).toBeCloseTo(exp.ogolem, 2)
    expect(r.razemWgGrup).toBeCloseTo(exp.razem_wg_grup, 2)
  })

  it('grupy: ilość, wartość, rabat', () => {
    if (!res.ok) throw new Error('parse failed')
    const got = Object.fromEntries(
      res.report.grupy.map((g) => [String(g.nr), { nazwa: g.nazwa, ilosc: g.ilosc, wartosc: g.wartosc, rabat: g.rabat }]),
    )
    expect(got).toEqual(exp.grupy)
  })

  it('liczba pozycji i wybrane pozycje', () => {
    if (!res.ok) throw new Error('parse failed')
    const poz = res.report.pozycje
    expect(poz.length).toBe(exp.liczba_pozycji_towarow)
    for (const [nazwa, e] of Object.entries(exp.wybrane_pozycje)) {
      const found = poz.filter((p) => p.grupa === e.group && normalizeName(p.nazwa) === nazwa)
      expect(found, nazwa).toHaveLength(1)
      expect({ nazwa, qty: found[0].ilosc, value: found[0].wartosc }).toEqual({ nazwa, qty: e.qty, value: e.value })
    }
  })

  it('ostrzeżenie Ogółem ≠ Razem tylko w 04 i 06', () => {
    const has = res.warnings.some((w) => w.includes('Ogółem'))
    expect(has).toBe(miesiac === '2026-04' || miesiac === '2026-06')
  })
})
