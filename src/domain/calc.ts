/**
 * Obliczenia miesiąca. Zasada: liczymy, co się da, nigdy nie rzucamy wyjątku.
 * Każda wartość to `{ ok: true, v }` albo `{ ok: false, brak: [czego brakuje] }`.
 */
import { splitPosKey } from '../parser/normalize'
import { effectiveMappings } from './mapping'
import type { AppState, Invoice, KategoriaKawy, MonthData, NumField, Product, ProductEntry } from './types'

export type Val = { ok: true; v: number } | { ok: false; brak: string[] }

export const ok = (v: number): Val => ({ ok: true, v })
export const missing = (...brak: string[]): Val => ({ ok: false, brak })

/** Łączy wartości: jeśli wszystkie są, liczy `f`, inaczej zwraca sumę braków (bez powtórzeń). */
export function lift(vals: Val[], f: (...v: number[]) => number | null): Val {
  const brak = [...new Set(vals.flatMap((x) => (x.ok ? [] : x.brak)))]
  if (brak.length) return { ok: false, brak }
  const r = f(...vals.map((x) => (x as { v: number }).v))
  return r === null || !Number.isFinite(r) ? missing('nie da się policzyć (dzielenie przez 0)') : ok(r)
}

export const BRAK = {
  raport: 'raport z kasy',
  wypal: 'kg z wypału',
  faktury: 'faktury (albo „brak dostaw”)',
  start: 'stan początkowy',
  koniec: 'stan końcowy',
  cena: 'cena (brak faktur)',
  cenaKawy: 'cena (koszt wypału albo faktura)',
} as const

export function prevMonth(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`
}

export function nextMonth(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
}

export interface SalesLine {
  posKey: string
  nazwa: string
  grupa: number
  ilosc: number
  przelicznik: number
  /** ilosc × przelicznik, w jednostce produktu */
  ilJedn: number
  wartosc: number
  przychodTutaj: boolean
  etykieta?: string
  kategoriaKawy?: KategoriaKawy
  zalozenie?: string
}

export type Alarm = 'brak' | 'ok' | 'żółty' | 'czerwony'

export interface ProductCalc {
  product: Product
  linie: SalesLine[]
  sprzedaz: Val
  sprzedazZl: Val
  start: Val
  startZrodlo: 'ręcznie' | 'poprzedni miesiąc' | 'brak'
  zakupy: Val
  wydane: Val
  pracIlosc: number
  pracKwota: number
  straty: number
  koniec: Val
  oczekiwany: Val
  roznica: Val
  roznicaPct: Val
  cena: Val
  cenaZrodlo?: string
  roznicaZl: Val
  wplynelo: Val
  zuzycie: Val
  kosztZuzycia: Val
  marza: Val
  marzaPct: Val
  alarm: Alarm
}

const num = (f?: NumField): number => f?.value ?? 0
const opt = (f: NumField | undefined, brak: string): Val => (f ? ok(f.value) : missing(brak))

export function invoicesInMonth(state: AppState, miesiac: string): Invoice[] {
  return state.invoices.filter((i) => i.miesiacRozliczenia === miesiac)
}

/** Ilość na linii faktury w jednostce produktu (zielone ziarno → po ubytku). */
export function lineQty(state: AppState, l: Invoice['linie'][number]): number {
  if (!l.zieloneZiarno) return l.ilosc.value
  const ubytek = l.ubytekWypalu ?? state.settings.ubytekWypalu
  return l.ilosc.value * (1 - ubytek / 100)
}

function invoiceLines(state: AppState, miesiac: string, productId: string) {
  return invoicesInMonth(state, miesiac).flatMap((i) => i.linie.filter((l) => l.productId === productId))
}

export function salesLines(state: AppState, month: MonthData | undefined, productId: string): SalesLine[] {
  if (!month?.raport) return []
  const out: SalesLine[] = []
  for (const p of month.raport.pozycje) {
    for (const m of effectiveMappings(state, p.posKey)) {
      if (m.productId !== productId) continue
      out.push({
        posKey: p.posKey,
        nazwa: p.nazwa,
        grupa: splitPosKey(p.posKey).grupa,
        ilosc: p.ilosc,
        przelicznik: m.przelicznik,
        ilJedn: p.ilosc * m.przelicznik,
        wartosc: m.przychodTutaj ? p.wartosc : 0,
        przychodTutaj: m.przychodTutaj,
        etykieta: m.etykieta,
        kategoriaKawy: m.kategoriaKawy,
        zalozenie: m.zalozenie,
      })
    }
  }
  return out
}

/** Cena jednostkowa z zakupów miesiąca (faktury − kaucja, wypał z kosztem). null = brak danych. */
function ownPrice(state: AppState, miesiac: string, product: Product): number | null {
  let zl = 0
  let qty = 0
  for (const l of invoiceLines(state, miesiac, product.id)) {
    const q = lineQty(state, l)
    if (q <= 0) continue
    zl += l.kwotaBrutto.value - num(l.kaucja)
    qty += q
  }
  const month = state.months[miesiac]
  if (product.wypal && month?.kgZWypalu && month.kosztWypalu && month.kgZWypalu.value > 0) {
    zl += month.kosztWypalu.value
    qty += month.kgZWypalu.value
  }
  return qty > 0 ? zl / qty : null
}

function priceFor(state: AppState, miesiac: string, product: Product): { cena: Val; zrodlo?: string } {
  const own = ownPrice(state, miesiac, product)
  if (own !== null) return { cena: ok(own), zrodlo: 'ten miesiąc' }
  const earlier = new Set<string>([...Object.keys(state.months), ...state.invoices.map((i) => i.miesiacRozliczenia)])
  for (const m of [...earlier].filter((m) => m < miesiac).sort().reverse()) {
    const p = ownPrice(state, m, product)
    if (p !== null) return { cena: ok(p), zrodlo: m }
  }
  return { cena: missing(product.wypal ? BRAK.cenaKawy : BRAK.cena) }
}

function startFor(state: AppState, miesiac: string, productId: string): { start: Val; zrodlo: ProductCalc['startZrodlo'] } {
  const own = state.months[miesiac]?.wpisy[productId]?.start
  if (own) return { start: ok(own.value), zrodlo: 'ręcznie' }
  const prev = state.months[prevMonth(miesiac)]?.wpisy[productId]?.koniec
  if (prev) return { start: ok(prev.value), zrodlo: 'poprzedni miesiąc' }
  return { start: missing(BRAK.start), zrodlo: 'brak' }
}

function alarmOf(state: AppState, pct: Val): Alarm {
  if (!pct.ok) return 'brak'
  const a = Math.abs(pct.v) * 100
  if (a > state.settings.progCzerwony) return 'czerwony'
  if (a > state.settings.progZolty) return 'żółty'
  return 'ok'
}

export function computeProduct(state: AppState, miesiac: string, product: Product): ProductCalc {
  const month = state.months[miesiac]
  const e: ProductEntry = month?.wpisy[product.id] ?? {}
  const linie = salesLines(state, month, product.id)

  const sprzedaz = month?.raport ? ok(linie.reduce((s, l) => s + l.ilJedn, 0)) : missing(BRAK.raport)
  const sprzedazZl = month?.raport ? ok(linie.reduce((s, l) => s + l.wartosc, 0)) : missing(BRAK.raport)

  const { start, zrodlo: startZrodlo } = startFor(state, miesiac, product.id)

  const inv = invoiceLines(state, miesiac, product.id)
  const zFaktur = inv.reduce((s, l) => s + lineQty(state, l), 0)
  const wydaneFaktury = inv.reduce((s, l) => s + l.kwotaBrutto.value - num(l.kaucja), 0)
  let zakupy: Val
  if (product.wypal) {
    zakupy = month?.kgZWypalu ? ok(month.kgZWypalu.value + zFaktur) : e.brakDostaw ? ok(zFaktur) : missing(BRAK.wypal)
  } else {
    zakupy = inv.length || e.brakDostaw ? ok(zFaktur) : missing(BRAK.faktury)
  }
  const wydane = ok(wydaneFaktury + (product.wypal ? num(month?.kosztWypalu) : 0))

  const pracIlosc = num(e.pracownicyIlosc)
  const pracKwota = num(e.pracownicyKwota)
  const straty = num(e.straty)
  const koniec = opt(e.koniec, BRAK.koniec)

  const oczekiwany = lift([start, zakupy, sprzedaz], (s, z, sp) => s + z - sp - pracIlosc - straty)
  const roznica = lift([koniec, oczekiwany], (k, o) => k - o)
  const roznicaPct = lift([roznica, sprzedaz], (r, sp) => (sp + pracIlosc === 0 ? null : r / (sp + pracIlosc)))

  const { cena, zrodlo: cenaZrodlo } = priceFor(state, miesiac, product)
  const roznicaZl = lift([roznica, cena], (r, c) => r * c)

  const wplynelo = lift([sprzedazZl], (s) => s + pracKwota)
  const zuzycie = lift([start, zakupy, koniec], (s, z, k) => s + z - k)
  const kosztZuzycia = lift([zuzycie, cena], (z, c) => z * c)
  const marza = lift([wplynelo, kosztZuzycia], (w, k) => w - k)
  const marzaPct = lift([marza, wplynelo], (m, w) => (w === 0 ? null : m / w))

  return {
    product,
    linie,
    sprzedaz,
    sprzedazZl,
    start,
    startZrodlo,
    zakupy,
    wydane,
    pracIlosc,
    pracKwota,
    straty,
    koniec,
    oczekiwany,
    roznica,
    roznicaPct,
    cena,
    cenaZrodlo,
    roznicaZl,
    wplynelo,
    zuzycie,
    kosztZuzycia,
    marza,
    marzaPct,
    alarm: alarmOf(state, roznicaPct),
  }
}

/** Wiersz sumy dla grupy widoku (np. „Drożdżówki razem”). */
export interface GroupCalc {
  nazwa: string
  productIds: string[]
  sprzedaz: Val
  sprzedazZl: Val
  start: Val
  zakupy: Val
  wydane: Val
  pracIlosc: number
  pracKwota: number
  straty: number
  koniec: Val
  roznica: Val
  roznicaPct: Val
  roznicaZl: Val
  wplynelo: Val
  marza: Val
  alarm: Alarm
}

function sumVals(vals: Val[]): Val {
  return lift(vals, (...v) => v.reduce((a, b) => a + b, 0))
}

export function computeGroup(state: AppState, nazwa: string, items: ProductCalc[]): GroupCalc {
  const pracIlosc = items.reduce((s, c) => s + c.pracIlosc, 0)
  const sprzedaz = sumVals(items.map((c) => c.sprzedaz))
  const roznica = sumVals(items.map((c) => c.roznica))
  const roznicaPct = lift([roznica, sprzedaz], (r, sp) => (sp + pracIlosc === 0 ? null : r / (sp + pracIlosc)))
  return {
    nazwa,
    productIds: items.map((c) => c.product.id),
    sprzedaz,
    sprzedazZl: sumVals(items.map((c) => c.sprzedazZl)),
    start: sumVals(items.map((c) => c.start)),
    zakupy: sumVals(items.map((c) => c.zakupy)),
    wydane: sumVals(items.map((c) => c.wydane)),
    pracIlosc,
    pracKwota: items.reduce((s, c) => s + c.pracKwota, 0),
    straty: items.reduce((s, c) => s + c.straty, 0),
    koniec: sumVals(items.map((c) => c.koniec)),
    roznica,
    roznicaPct,
    roznicaZl: sumVals(items.map((c) => c.roznicaZl)),
    wplynelo: sumVals(items.map((c) => c.wplynelo)),
    marza: sumVals(items.map((c) => c.marza)),
    alarm: alarmOf(state, roznicaPct),
  }
}

export interface CoffeeDetails {
  kategorie: Record<KategoriaKawy, { szt: number; kg: number; linie: SalesLine[] }>
  torebki: { gramatura: number; szt: number }[]
  torebkiSzt: number
  torebkiKg: number
  pracownicyKg: number
  stratyKg: number
  /** sprzedaż z kasy + pracownicy + straty */
  zuzycieTeoretyczne: Val
  zuzycieFaktyczne: Val
  /** Przychód z napojów (bez torebek i pracowników). */
  przychodNapoje: number
  /** Koszt ziarna zużytego na napoje jako % przychodu z napojów. */
  kosztNapojowPct: Val
  /** Ile kg musiało wyjść z wypału, żeby bilans wyszedł na zero. */
  wypalPotrzebny: Val
}

const KATEGORIE: KategoriaKawy[] = ['ekspres', 'przelew', 'cold brew', 'alternatywa', 'torebki', 'inne', 'bez ziarna']

export function computeCoffee(state: AppState, miesiac: string, c: ProductCalc): CoffeeDetails {
  const kategorie = Object.fromEntries(KATEGORIE.map((k) => [k, { szt: 0, kg: 0, linie: [] as SalesLine[] }])) as CoffeeDetails['kategorie']
  const sizes = new Map<number, number>()
  for (const l of c.linie) {
    const k = kategorie[l.kategoriaKawy ?? 'inne']
    k.szt += l.ilosc
    k.kg += l.ilJedn
    k.linie.push(l)
    if (l.kategoriaKawy === 'torebki') {
      const g = Math.round(l.przelicznik * 1000)
      sizes.set(g, (sizes.get(g) ?? 0) + l.ilosc)
    }
  }
  const torebki = [...new Set([250, 500, 1000, ...sizes.keys()])]
    .sort((a, b) => a - b)
    .map((g) => ({ gramatura: g, szt: sizes.get(g) ?? 0 }))

  const napojeLinie = c.linie.filter((l) => l.kategoriaKawy !== 'torebki')
  const przychodNapoje = napojeLinie.reduce((s, l) => s + l.wartosc, 0)
  const kgNapoje = napojeLinie.reduce((s, l) => s + l.ilJedn, 0)

  const zFaktur = invoiceLines(state, miesiac, c.product.id).reduce((s, l) => s + lineQty(state, l), 0)

  return {
    kategorie,
    torebki,
    torebkiSzt: kategorie.torebki.szt,
    torebkiKg: kategorie.torebki.kg,
    pracownicyKg: c.pracIlosc,
    stratyKg: c.straty,
    zuzycieTeoretyczne: lift([c.sprzedaz], (s) => s + c.pracIlosc + c.straty),
    zuzycieFaktyczne: c.zuzycie,
    przychodNapoje,
    kosztNapojowPct: lift([c.cena], (cena) => (przychodNapoje === 0 ? null : (kgNapoje * cena) / przychodNapoje)),
    wypalPotrzebny: lift([c.koniec, c.start, c.sprzedaz], (k, s, sp) => k - s + sp + c.pracIlosc + c.straty - zFaktur),
  }
}

export interface MonthCalc {
  miesiac: string
  produkty: ProductCalc[]
  grupy: GroupCalc[]
  kawa?: CoffeeDetails
  sumy: { wydane: number; wplynelo: Val }
}

export function computeMonth(state: AppState, miesiac: string): MonthCalc {
  const products = state.products.filter((p) => p.aktywny).sort((a, b) => a.kolejnosc - b.kolejnosc)
  const produkty = products.map((p) => computeProduct(state, miesiac, p))
  const groupNames = [...new Set(products.map((p) => p.grupaWidoku).filter((g): g is string => !!g))]
  const grupy = groupNames.map((g) =>
    computeGroup(
      state,
      g,
      produkty.filter((c) => c.product.grupaWidoku === g),
    ),
  )
  const kawaCalc = produkty.find((c) => c.product.wypal)
  return {
    miesiac,
    produkty,
    grupy,
    kawa: kawaCalc ? computeCoffee(state, miesiac, kawaCalc) : undefined,
    sumy: {
      wydane: produkty.reduce((s, c) => s + (c.wydane.ok ? c.wydane.v : 0), 0),
      wplynelo: sumVals(produkty.map((c) => c.wplynelo)),
    },
  }
}
