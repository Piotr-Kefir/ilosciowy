import { matchRule } from './mapping'
import seedSeen from './seed-seen.json'
import type { AppState, KategoriaKawy, NumField, PosMapping, PosRule, PosSeen, Product, Receptura } from './types'

export const DEFAULT_PRODUCTS: Product[] = [
  { id: 'kawa', nazwa: 'Kawa – ziarno', jednostka: 'kg', aktywny: true, kolejnosc: 1, wypal: true },
  {
    id: 'lody',
    nazwa: 'Lody',
    jednostka: 'kg',
    aktywny: true,
    kolejnosc: 2,
    jednostkaPomocnicza: { nazwa: 'porcja', ile: 0.07 },
  },
  { id: 'matcha', nazwa: 'Matcha', jednostka: 'kg', aktywny: true, kolejnosc: 3 },
  { id: 'miomio', nazwa: 'Miomio', jednostka: 'szt', aktywny: true, kolejnosc: 4 },
  { id: 'piwo', nazwa: 'Piwo', jednostka: 'szt', aktywny: true, kolejnosc: 5 },
  { id: 'ciasto-vegan', nazwa: 'Ciasto vegan', jednostka: 'szt', aktywny: true, kolejnosc: 6 },
  { id: 'cynamonka', nazwa: 'Cynamonka', jednostka: 'szt', grupaWidoku: 'Drożdżówki', aktywny: true, kolejnosc: 7 },
  { id: 'jagodzianka', nazwa: 'Jagodzianka', jednostka: 'szt', grupaWidoku: 'Drożdżówki', aktywny: true, kolejnosc: 8 },
  { id: 'malinianka', nazwa: 'Malinianka', jednostka: 'szt', grupaWidoku: 'Drożdżówki', aktywny: true, kolejnosc: 9 },
  { id: 'cava', nazwa: 'Cava', jednostka: 'butelka', aktywny: true, kolejnosc: 10 },
  { id: 'cava-rose', nazwa: 'Cava rosé', jednostka: 'butelka', aktywny: true, kolejnosc: 11 },
]

const ESPRESSO_G = 18

/** Napoje z ekspresu — 18 g ziarna na sztukę. */
const EKSPRES = [
  'cappuccino',
  'latte',
  'flat white',
  'americano',
  'americano na lodzie',
  'espresso doppio',
  'espresso tonic',
  'sezonowa latte',
  'lawendowa latte',
  'macchiato 70ml',
  'mocca',
  'mocca iced',
  'latte mrożone',
  'flat mrożony',
  'shakerato',
  'cortado',
  'dirty chai latte',
  '+ shot',
]

const MATCHA = [
  'matcha latte',
  'matcha latte ice',
  'matcha sezonowa ice (owoce)',
  'matcha tonic',
  'lawendowa matcha latte',
  'sezonowa matcha/hojicha latte',
]

let seq = 0
function m(
  posKey: string,
  productId: string,
  przelicznik: number,
  extra: Partial<PosMapping> = {},
): PosMapping {
  return { id: `def-${++seq}`, posKey, productId, przelicznik, przychodTutaj: true, ...extra }
}

function kawa(posKey: string, receptura: Receptura, kategoriaKawy: KategoriaKawy, extra: Partial<PosMapping> = {}) {
  return m(posKey, 'kawa', przelicznikZReceptury(receptura), { receptura, kategoriaKawy, ...extra })
}

export function przelicznikZReceptury(r: Receptura): number {
  return r.typ === 'g' ? r.g / 1000 : (r.ml * r.gNaLitr) / 1_000_000
}

export function defaultMappings(): PosMapping[] {
  seq = 0
  return [
    // Kawa
    ...EKSPRES.map((n) => kawa(`1|${n}`, { typ: 'g', g: ESPRESSO_G }, 'ekspres')),
    kawa('1|szybki przelew 220ml', { typ: 'ml', ml: 220, gNaLitr: 60 }, 'przelew'),
    kawa('1|szybki przelew duży 320ml', { typ: 'ml', ml: 320, gNaLitr: 60 }, 'przelew'),
    kawa('1|cold brew', { typ: 'ml', ml: 230, gNaLitr: 70 }, 'cold brew', {
      zalozenie: '230 ml z arkusza — do potwierdzenia',
    }),
    kawa('1|alternatywa 220ml', { typ: 'g', g: 18 }, 'alternatywa'),
    kawa('1|alternatywa x2 (jedno parzenie)', { typ: 'g', g: 36 }, 'alternatywa', {
      zalozenie: '36 g (dwie porcje) — założenie',
    }),
    kawa('1|+ bezkofeinowa', { typ: 'g', g: 0 }, 'bez ziarna'),
    kawa('1|afogatto lody z kawą', { typ: 'g', g: ESPRESSO_G }, 'inne', { przychodTutaj: false }),
    kawa('7|espresso aperol', { typ: 'g', g: ESPRESSO_G }, 'inne', {
      przychodTutaj: false,
      zalozenie: 'zawiera espresso — założenie',
    }),
    kawa('3|espresso aperol 0%', { typ: 'g', g: ESPRESSO_G }, 'inne', {
      przychodTutaj: false,
      zalozenie: 'zawiera espresso — założenie',
    }),
    kawa('6|doppio', { typ: 'g', g: 0 }, 'bez ziarna', { przychodTutaj: false }),
    kawa('6|pół shota (pojedynczy)', { typ: 'g', g: 0 }, 'bez ziarna', { przychodTutaj: false }),
    // Lody
    m('2|lody 1 porcja ok. 70g', 'lody', 0.07),
    m('1|afogatto lody z kawą', 'lody', 0.1),
    // Matcha
    ...MATCHA.map((n) => m(`3|${n}`, 'matcha', 0.0045)),
    m('3|hojicha latte', 'matcha', 0.0045, { zalozenie: 'hojicha liczona razem z matchą — założenie' }),
    // Pozostałe
    m('3|miomio mate', 'miomio', 1),
    m('7|piwo 0,5 litra', 'piwo', 1, { etykieta: 'alko' }),
    m('3|piwo bez alko 0,5 l', 'piwo', 1, { etykieta: '0%' }),
    m('2|ciasto vegan', 'ciasto-vegan', 1),
    m('2|cynamonka z jag.', 'cynamonka', 1),
    m('2|jagodzianka vegan', 'jagodzianka', 1),
    m('2|malinianka', 'malinianka', 1),
    m('7|wino musujące cava cava 125 ml', 'cava', 0.2, { etykieta: 'kieliszek' }),
    m('5|wino musujące cava cava 6 x 125 ml', 'cava', 1, { etykieta: 'zestaw' }),
    m('7|wino musujące cava rose 125 ml', 'cava-rose', 0.2),
  ]
}

export const DEFAULT_RULES: PosRule[] = [
  {
    id: 'torebki',
    nazwa: 'Torebki kawy (gramatura z nazwy)',
    grupa: 10,
    wzorzec: '(\\d+)\\s*g$',
    productId: 'kawa',
    przychodTutaj: true,
    kategoriaKawy: 'torebki',
  },
]

/**
 * Pozycje widziane w raportach 01–07.2026. Te bez przypisania i bez reguły są
 * domyślnie „nieśledzone”, żeby pierwszy import (sierpień) nie zalał baneru.
 */
export function defaultSeen(mappings: PosMapping[], rules: PosRule[]): Record<string, PosSeen> {
  const mapped = new Set(mappings.map((x) => x.posKey))
  const out: Record<string, PosSeen> = {}
  for (const s of seedSeen as PosSeen[]) {
    const tracked = mapped.has(s.posKey) || rules.some((r) => matchRule(r, s.posKey))
    out[s.posKey] = { ...s, niesledzona: tracked ? undefined : true }
  }
  return out
}

export function defaultState(): AppState {
  const mappings = defaultMappings()
  return {
    version: 1,
    products: DEFAULT_PRODUCTS.map((p) => ({ ...p })),
    mappings,
    rules: DEFAULT_RULES.map((r) => ({ ...r })),
    seen: defaultSeen(mappings, DEFAULT_RULES),
    months: {},
    invoices: [],
    settings: { progZolty: 2, progCzerwony: 5, ubytekWypalu: 17.5, grupyAlarmowe: [1, 2, 5, 7, 10] },
  }
}

const nf = (expr: string, value: number): NumField => ({ expr, value })

/** Inwentaryzacja 31.07.2026 — stan początkowy sierpnia (przycisk „wczytaj stany z 31.07”). */
export const STANY_31_07: Record<string, NumField> = {
  piwo: nf('316+175', 491),
  lody: nf('35', 35),
  miomio: nf('145', 145),
  'ciasto-vegan': nf('18', 18),
  kawa: nf('4,238+0,75+3,2999+61,945', 70.2329),
}
