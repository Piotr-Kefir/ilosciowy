import { beforeAll, describe, expect, it } from 'vitest'
import { importReport, loadStany3107, setEntryField, setMonthField, upsertInvoice } from '../src/domain/actions'
import { computeMonth, type ProductCalc, type Val } from '../src/domain/calc'
import { defaultState } from '../src/domain/defaults'
import { evalExpr } from '../src/domain/expr'
import { analyzePositions } from '../src/domain/mapping'
import type { AppState, NumField } from '../src/domain/types'
import type { PosReport } from '../src/parser/types'
import { reportFor } from './helpers'

const nf = (expr: string): NumField => {
  const r = evalExpr(expr)
  if (!r.ok) throw new Error(r.error)
  return { expr, value: r.value }
}
const v = (x: Val) => (x.ok ? x.v : `brak: ${x.brak.join(', ')}`)
const prod = (s: AppState, m: string, id: string): ProductCalc =>
  computeMonth(s, m).produkty.find((p) => p.product.id === id)!

let lipiec: PosReport
let sierpien: PosReport
beforeAll(async () => {
  lipiec = await reportFor('2026-07')
  sierpien = await reportFor('2026-08')
})

describe('pola z wyrażeniami', () => {
  it.each([
    ['1,25+0,133+2,855', 4.238],
    ['316+175', 491],
    ['11+3+1+1+1', 17],
    ['4,238 + 0,75 + 3,2999 + 61,945', 70.2329],
    ['(2+2)*0,07', 0.28],
    ['-3', -3],
  ])('%s → %d', (expr, want) => {
    const r = evalExpr(expr)
    expect(r.ok && r.value).toBeCloseTo(want, 9)
  })

  it.each(['', 'abc', '1++', '2,5,3', '10.07.2026'])('„%s” → błąd, bez wyjątku', (expr) => {
    expect(evalExpr(expr).ok).toBe(false)
  })
})

describe('kawa — lipiec 2026 (zgodność z arkuszem)', () => {
  it('napoje z ekspresu = 4580, torebki 195/42/24 = 93,75 kg', () => {
    const s = importReport(defaultState(), lipiec)
    const k = computeMonth(s, '2026-07').kawa!
    expect(k.kategorie.ekspres.szt).toBe(4580)
    expect(k.torebki).toEqual([
      { gramatura: 250, szt: 195 },
      { gramatura: 500, szt: 42 },
      { gramatura: 1000, szt: 24 },
    ])
    expect(k.torebkiKg).toBeCloseTo(93.75, 9)
  })

  it('zużycie teoretyczne: bezkofeinowa 0 g, affogato i espresso aperol po 18 g', () => {
    const s = importReport(defaultState(), lipiec)
    const k = computeMonth(s, '2026-07').kawa!
    expect(k.kategorie['bez ziarna'].kg).toBe(0)
    expect(k.kategorie.inne.szt).toBe(84 + 6) // affogato + espresso aperol
    expect(k.kategorie.przelew.kg).toBeCloseTo(466 * 0.0192 + 252 * 0.0132, 9)
    expect(k.kategorie['cold brew'].kg).toBeCloseTo(224 * 0.0161, 9)
  })

  it('lody: 1237 porcji + affogato 84', () => {
    const s = importReport(defaultState(), lipiec)
    const l = prod(s, '2026-07', 'lody')
    const porcje = l.linie.find((x) => x.posKey === '2|lody 1 porcja ok. 70g')!
    const aff = l.linie.find((x) => x.posKey === '1|afogatto lody z kawą')!
    expect(porcje.ilosc).toBe(1237)
    expect(aff.ilosc).toBe(84)
    expect(v(l.sprzedaz)).toBeCloseTo(1237 * 0.07 + 84 * 0.1, 9)
    // przychód affogato liczony przy lodach, nie przy kawie
    expect(aff.przychodTutaj).toBe(true)
    const kawaAff = prod(s, '2026-07', 'kawa').linie.find((x) => x.posKey === '1|afogatto lody z kawą')!
    expect(kawaAff.wartosc).toBe(0)
  })
})

describe('bilans piwa — lipiec 2026', () => {
  it('oczekiwany 495 → różnica −4 szt', () => {
    let s = importReport(defaultState(), lipiec)
    s = setEntryField(s, '2026-07', 'piwo', 'start', nf('481'))
    const faktury: [string, number, number][] = [
      ['F1', 131, 1000.86],
      ['F2', 142, 1095.71],
      ['F3', 213, 1443.41],
      ['F4', 101, 802.54],
    ]
    for (const [numer, szt, zl] of faktury)
      s = upsertInvoice(s, {
        id: numer,
        numer,
        bezFaktury: false,
        data: '2026-07-10',
        miesiacRozliczenia: '2026-07',
        linie: [{ id: numer, productId: 'piwo', ilosc: nf(String(szt)), kwotaBrutto: nf(String(zl).replace('.', ',')) }],
      })
    s = setEntryField(s, '2026-07', 'piwo', 'pracownicyIlosc', nf('21'))
    s = setEntryField(s, '2026-07', 'piwo', 'pracownicyKwota', nf('210'))
    s = setEntryField(s, '2026-07', 'piwo', 'straty', nf('2+1'))
    s = setEntryField(s, '2026-07', 'piwo', 'koniec', nf('316+175'))

    const p = prod(s, '2026-07', 'piwo')
    expect(v(p.zakupy)).toBe(587)
    expect(v(p.wydane)).toBeCloseTo(4342.52, 2)
    expect(v(p.sprzedaz)).toBe(549)
    expect(p.linie.map((l) => [l.etykieta, l.ilosc])).toEqual([
      ['0%', 113],
      ['alko', 436],
    ])
    expect(v(p.oczekiwany)).toBe(495)
    expect(v(p.roznica)).toBe(-4)
    expect(v(p.roznicaPct)).toBeCloseTo(-4 / 570, 9)
    expect(v(p.cena)).toBeCloseTo(4342.52 / 587, 9)
    expect(v(p.roznicaZl)).toBeCloseTo((-4 * 4342.52) / 587, 6)
    expect(v(p.wplynelo)).toBeCloseTo(7410.3 + 1919.3 + 210, 2)
  })
})

describe('brakujące dane — sierpień z samym raportem', () => {
  it('liczy wszystko z kasy, różnica czeka na konkretne pola, bez wyjątków', () => {
    const s = importReport(defaultState(), sierpien)
    const mc = computeMonth(s, '2026-08')
    const kawa = mc.produkty.find((p) => p.product.id === 'kawa')!
    expect(kawa.sprzedaz.ok).toBe(true)
    expect(mc.kawa!.torebkiSzt).toBeGreaterThan(0)
    expect(kawa.roznica.ok).toBe(false)
    if (!kawa.roznica.ok) expect(kawa.roznica.brak).toEqual(expect.arrayContaining(['kg z wypału', 'stan końcowy']))
    expect(kawa.marza.ok).toBe(false)
    expect(kawa.cena.ok).toBe(false)
    expect(kawa.wplynelo.ok).toBe(true)
    // pozostałe produkty też liczą sprzedaż, nie liczą różnicy
    for (const p of mc.produkty) {
      expect(p.sprzedaz.ok).toBe(true)
      expect(p.roznica.ok).toBe(false)
      expect(p.alarm).toBe('brak')
    }
    expect(mc.grupy.map((g) => g.nazwa)).toEqual(['Drożdżówki'])
  })

  it('po wpisaniu stanów i kg z wypału wylicza się różnica', () => {
    let s = importReport(defaultState(), sierpien)
    s = loadStany3107(s, '2026-08')
    s = setEntryField(s, '2026-08', 'kawa', 'koniec', nf('60'))

    let kawa = prod(s, '2026-08', 'kawa')
    expect(kawa.roznica.ok).toBe(false)
    if (!kawa.roznica.ok) expect(kawa.roznica.brak).toEqual(['kg z wypału'])

    const k = computeMonth(s, '2026-08').kawa!
    const sprzedaz = v(kawa.sprzedaz) as number
    expect(v(k.wypalPotrzebny)).toBeCloseTo(60 - 70.2329 + sprzedaz, 6)

    s = setMonthField(s, '2026-08', 'kgZWypalu', nf('100'))
    kawa = prod(s, '2026-08', 'kawa')
    expect(v(kawa.roznica)).toBeCloseTo(60 - (70.2329 + 100 - sprzedaz), 6)
    expect(kawa.cena.ok).toBe(false) // brak kosztu wypału → brak ceny, ilości liczą się normalnie

    s = setMonthField(s, '2026-08', 'kosztWypalu', nf('5000'))
    kawa = prod(s, '2026-08', 'kawa')
    expect(v(kawa.cena)).toBe(50)
    expect(kawa.marza.ok).toBe(true)
  })

  it('stan początkowy kolejnego miesiąca = stan końcowy poprzedniego, przelicza się po zmianie', () => {
    let s = importReport(defaultState(), sierpien)
    s = setEntryField(s, '2026-08', 'piwo', 'koniec', nf('400'))
    expect(v(prod(s, '2026-09', 'piwo').start)).toBe(400)
    s = setEntryField(s, '2026-08', 'piwo', 'koniec', nf('410'))
    expect(v(prod(s, '2026-09', 'piwo').start)).toBe(410)
    expect(prod(s, '2026-09', 'piwo').startZrodlo).toBe('poprzedni miesiąc')
  })

  it('ostatnia znana cena, gdy w miesiącu brak faktur', () => {
    let s = importReport(defaultState(), sierpien)
    s = upsertInvoice(s, {
      id: 'a',
      numer: '1/07',
      bezFaktury: false,
      data: '2026-07-03',
      miesiacRozliczenia: '2026-07',
      linie: [{ id: 'a', productId: 'miomio', ilosc: nf('48'), kwotaBrutto: nf('530,38'), kaucja: nf('50') }],
    })
    const p = prod(s, '2026-08', 'miomio')
    expect(v(p.cena)).toBeCloseTo(480.38 / 48, 9)
    expect(p.cenaZrodlo).toBe('2026-07')
  })
})

describe('matcha — sierpień 2026', () => {
  it('161 + 121 + 122 + 74 = 478 napojów × 4,5 g = 2,151 kg', () => {
    const s = importReport(defaultState(), sierpien)
    const m = prod(s, '2026-08', 'matcha')
    expect(m.linie.reduce((a, l) => a + l.ilosc, 0)).toBe(478)
    expect(v(m.sprzedaz)).toBeCloseTo(2.151, 9)
  })
})

describe('cava', () => {
  it('kieliszek = 1/5 butelki, zestaw 6 × 125 ml = 1 butelka, rosé osobno', () => {
    const s = importReport(defaultState(), lipiec)
    expect(v(prod(s, '2026-07', 'cava').sprzedaz)).toBeCloseTo(102 / 5 + 1, 9)
    expect(v(prod(s, '2026-07', 'cava-rose').sprzedaz)).toBeCloseTo(4 / 5, 9)
  })
})

describe('nowe pozycje', () => {
  it('sierpień: nowe są tylko pozycje niewidziane w 01–07; bez alarmu dla przypisanych', () => {
    const s = importReport(defaultState(), sierpien)
    const info = analyzePositions(s, sierpien.pozycje, '2026-08')
    const nowe = info.filter((i) => i.nowa).map((i) => i.pozycja.posKey)
    expect(nowe).toContain('2|malinianka')
    expect(nowe).not.toContain('1|cappuccino')
    const malinianka = info.find((i) => i.pozycja.posKey === '2|malinianka')!
    expect(malinianka.status).toBe('przypisana')
    expect(malinianka.alarm).toBe(false)
  })

  it('nowa nieprzypisana pozycja w grupie Kawy → alarm; ta sama nazwa w innej grupie → podpowiedź', () => {
    const s0 = defaultState()
    const raport: PosReport = {
      ...sierpien,
      pozycje: [
        { posKey: '1|pistacjowa latte', grupa: 1, nazwa: 'Pistacjowa latte', ilosc: 5, wartosc: 100 },
        { posKey: '3|piwo 0,5 litra', grupa: 3, nazwa: 'Piwo 0,5 litra', ilosc: 1, wartosc: 17 },
        { posKey: '4|nowy filtr', grupa: 4, nazwa: 'Nowy filtr', ilosc: 1, wartosc: 10 },
      ],
    }
    const s = importReport(s0, raport)
    const info = analyzePositions(s, raport.pozycje, '2026-08')
    expect(info.map((i) => [i.nowa, i.status, i.alarm])).toEqual([
      [true, 'bez decyzji', true],
      [true, 'bez decyzji', false],
      [true, 'bez decyzji', false],
    ])
    expect(info[1].podpowiedz?.posKey).toBe('7|piwo 0,5 litra')
  })
})

describe('eksport xlsx', () => {
  it('tabela, kawa i faktury; braki jako tekst „czeka na”', async () => {
    const { buildMonthWorkbook } = await import('../src/export')
    const XLSX = await import('xlsx')
    const s = importReport(defaultState(), lipiec)
    const wb = buildMonthWorkbook(s, '2026-07')
    expect(wb.SheetNames).toEqual(['Tabela', 'Kawa', 'Faktury'])
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Tabela)
    const piwo = rows.find((r) => r.Produkt === 'Piwo')!
    expect(piwo['Sprzedaż kasa (ilość)']).toBe(549)
    expect(piwo['Różnica']).toMatch(/^czeka na:/)
    expect(rows.some((r) => r.Produkt === 'Drożdżówki razem')).toBe(true)
  })
})
