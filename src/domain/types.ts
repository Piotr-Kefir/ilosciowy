import type { PosReport } from '../parser/types'

export type Jednostka = 'kg' | 'szt' | 'butelka'

/** Pole liczbowe wpisywane ręcznie: wyrażenie (np. „316+175”) i jego wynik w jednostce produktu. */
export interface NumField {
  expr: string
  value: number
  /** Wpisano w jednostce pomocniczej (np. porcje lodów); `value` jest już przeliczone. */
  pomocnicza?: boolean
}

export interface Product {
  id: string
  nazwa: string
  jednostka: Jednostka
  /** Np. „Drożdżówki” — produkty z tą samą grupą dostają wiersz sumy. */
  grupaWidoku?: string
  aktywny: boolean
  kolejnosc: number
  /** Opcjonalna jednostka do wpisywania strat/pracowników, np. porcja lodów = 0,070 kg. */
  jednostkaPomocnicza?: { nazwa: string; ile: number }
  /** Produkt z bilansem wypału (kawa). */
  wypal?: boolean
}

export type KategoriaKawy = 'ekspres' | 'przelew' | 'cold brew' | 'alternatywa' | 'torebki' | 'inne' | 'bez ziarna'

export type Receptura = { typ: 'g'; g: number } | { typ: 'ml'; ml: number; gNaLitr: number }

export interface PosMapping {
  id: string
  posKey: string
  productId: string
  /** Ile jednostek produktu na 1 szt. pozycji z kasy. Dla receptur liczone z `receptura`. */
  przelicznik: number
  receptura?: Receptura
  przychodTutaj: boolean
  /** Opis niepotwierdzonego założenia — w UI żółta plakietka. */
  zalozenie?: string
  /** Etykieta rozbicia sprzedaży w tabeli (np. piwo „alko” / „0%”). */
  etykieta?: string
  kategoriaKawy?: KategoriaKawy
}

/** Reguła dla pozycji bez jawnego przypisania, np. torebki kawy: gramatura z końcówki nazwy. */
export interface PosRule {
  id: string
  nazwa: string
  grupa: number
  /** Wyrażenie regularne na znormalizowanej nazwie; pierwsza grupa = gramy. */
  wzorzec: string
  productId: string
  przychodTutaj: boolean
  kategoriaKawy?: KategoriaKawy
}

export interface PosSeen {
  posKey: string
  pierwszyMiesiac: string
  ostatniaNazwaOryginalna: string
  /** Pozycja świadomie oznaczona jako nieśledzona. */
  niesledzona?: boolean
}

export interface ProductEntry {
  /** Ręczny stan początkowy; brak = stan końcowy z poprzedniego miesiąca. */
  start?: NumField
  koniec?: NumField
  straty?: NumField
  pracownicyIlosc?: NumField
  pracownicyKwota?: NumField
  /** Potwierdzone: w tym miesiącu nie było dostaw (zakupy = 0). */
  brakDostaw?: boolean
  notatka?: string
}

export interface MonthData {
  miesiac: string
  raport?: PosReport
  importedAt?: string
  zamknietyAt?: string
  wpisy: Record<string, ProductEntry>
  kgZWypalu?: NumField
  kosztWypalu?: NumField
}

export interface InvoiceLine {
  id: string
  productId: string
  ilosc: NumField
  kwotaBrutto: NumField
  /** Kaucja zł, odejmowana od kosztu (ujemna = zwrot kaucji). */
  kaucja?: NumField
  /** Faktura na zielone ziarno: ilość palonego = ilość × (1 − ubytek). */
  zieloneZiarno?: boolean
  ubytekWypalu?: number
}

export interface Invoice {
  id: string
  numer: string
  bezFaktury: boolean
  data: string
  dostawca?: string
  miesiacRozliczenia: string
  linie: InvoiceLine[]
}

export interface Settings {
  progZolty: number
  progCzerwony: number
  ubytekWypalu: number
  /** Grupy z kasy, w których nowa pozycja bez przypisania podnosi alarm. */
  grupyAlarmowe: number[]
  ostatniaKopia?: string
}

export interface AppState {
  version: 1
  products: Product[]
  mappings: PosMapping[]
  rules: PosRule[]
  seen: Record<string, PosSeen>
  months: Record<string, MonthData>
  invoices: Invoice[]
  settings: Settings
}
