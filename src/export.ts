import * as XLSX from 'xlsx'
import { computeMonth, invoicesInMonth, lineQty, type Val } from './domain/calc'
import type { AppState } from './domain/types'

/** Liczba albo tekst „czeka na: …” — w arkuszu puste ≠ 0. */
const cell = (v: Val, round = 4): number | string => (v.ok ? Math.round(v.v * 10 ** round) / 10 ** round : `czeka na: ${v.brak.join(', ')}`)

export function buildMonthWorkbook(state: AppState, miesiac: string): XLSX.WorkBook {
  const mc = computeMonth(state, miesiac)
  const wb = XLSX.utils.book_new()

  const tabela: (string | number)[][] = [
    [
      'Produkt',
      'Jednostka',
      'Start',
      'Zakupy',
      'Sprzedaż kasa (ilość)',
      'Sprzedaż kasa (zł)',
      'Pracownicy (ilość)',
      'Pracownicy (zł)',
      'Straty',
      'Stan końcowy',
      'Oczekiwany stan',
      'Różnica',
      'Różnica %',
      'Różnica zł',
      'Cena jedn.',
      'Wydane zł',
      'Wpłynęło zł',
      'Zużycie',
      'Koszt zużycia zł',
      'Marża zł',
    ],
  ]
  for (const c of mc.produkty)
    tabela.push([
      c.product.nazwa,
      c.product.jednostka,
      cell(c.start),
      cell(c.zakupy),
      cell(c.sprzedaz),
      cell(c.sprzedazZl, 2),
      c.pracIlosc,
      c.pracKwota,
      c.straty,
      cell(c.koniec),
      cell(c.oczekiwany),
      cell(c.roznica),
      cell(c.roznicaPct),
      cell(c.roznicaZl, 2),
      cell(c.cena, 2),
      cell(c.wydane, 2),
      cell(c.wplynelo, 2),
      cell(c.zuzycie),
      cell(c.kosztZuzycia, 2),
      cell(c.marza, 2),
    ])
  for (const g of mc.grupy)
    tabela.push([
      `${g.nazwa} razem`,
      'szt',
      cell(g.start),
      cell(g.zakupy),
      cell(g.sprzedaz),
      cell(g.sprzedazZl, 2),
      g.pracIlosc,
      g.pracKwota,
      g.straty,
      cell(g.koniec),
      '',
      cell(g.roznica),
      cell(g.roznicaPct),
      cell(g.roznicaZl, 2),
      '',
      cell(g.wydane, 2),
      cell(g.wplynelo, 2),
      '',
      '',
      cell(g.marza, 2),
    ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tabela), 'Tabela')

  if (mc.kawa) {
    const k = mc.kawa
    const rows: (string | number)[][] = [['Kategoria', 'Pozycja z kasy', 'Ilość szt.', 'g / szt.', 'Ziarno kg', 'Wartość zł (przychód kawy)']]
    for (const [kat, d] of Object.entries(k.kategorie))
      for (const l of d.linie) rows.push([kat, l.nazwa, l.ilosc, Math.round(l.przelicznik * 1e4) / 10, Math.round(l.ilJedn * 1e4) / 1e4, l.wartosc])
    rows.push([])
    rows.push(['Napoje z ekspresu', '', k.kategorie.ekspres.szt, '', Math.round(k.kategorie.ekspres.kg * 1e4) / 1e4])
    for (const t of k.torebki) rows.push([`Torebki ${t.gramatura} g`, '', t.szt, '', (t.szt * t.gramatura) / 1000])
    rows.push(['Torebki razem', '', k.torebkiSzt, '', k.torebkiKg])
    rows.push(['Pracownicy', '', '', '', k.pracownicyKg])
    rows.push(['Straty', '', '', '', k.stratyKg])
    rows.push(['Zużycie teoretyczne', '', '', '', cell(k.zuzycieTeoretyczne)])
    rows.push(['Zużycie faktyczne', '', '', '', cell(k.zuzycieFaktyczne)])
    rows.push(['Ile musiało wyjść z wypału', '', '', '', cell(k.wypalPotrzebny)])
    rows.push(['Przychód z napojów zł', '', '', '', k.przychodNapoje])
    rows.push(['Koszt ziarna / przychód z napojów', '', '', '', cell(k.kosztNapojowPct)])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Kawa')
  }

  const fak: (string | number)[][] = [['Numer', 'Data', 'Dostawca', 'Miesiąc rozliczenia', 'Produkt', 'Ilość', 'Ilość (po ubytku)', 'Kwota brutto', 'Kaucja', 'Wyrażenie ilości']]
  for (const inv of invoicesInMonth(state, miesiac))
    for (const l of inv.linie)
      fak.push([
        inv.bezFaktury ? `bez faktury ${inv.numer}`.trim() : inv.numer,
        inv.data,
        inv.dostawca ?? '',
        inv.miesiacRozliczenia,
        state.products.find((p) => p.id === l.productId)?.nazwa ?? l.productId,
        l.ilosc.value,
        lineQty(state, l),
        l.kwotaBrutto.value,
        l.kaucja?.value ?? '',
        l.ilosc.expr,
      ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fak), 'Faktury')

  return wb
}

export function exportMonthXlsx(state: AppState, miesiac: string) {
  XLSX.writeFile(buildMonthWorkbook(state, miesiac), `ilosciowy_${miesiac}.xlsx`)
}
