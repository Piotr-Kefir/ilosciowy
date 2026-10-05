/** Fragment tekstu z PDF wraz z pozycją (współrzędne PDF: y rośnie w górę). */
export interface TextItem {
  page: number
  str: string
  x: number
  y: number
  width: number
}

export interface ReportGroup {
  nr: number
  nazwa: string
  ilosc: number
  wartosc: number
  rabat: number
}

export interface ReportPosition {
  /** `${grupa}|${znormalizowana nazwa}` */
  posKey: string
  grupa: number
  /** Nazwa dokładnie jak w raporcie. */
  nazwa: string
  ilosc: number
  wartosc: number
}

export interface PosReport {
  /** Np. „01.07.2026 - 31.07.2026” */
  zakresTekst: string
  /** ISO YYYY-MM-DD */
  od: string
  do: string
  /** YYYY-MM, wg początku zakresu */
  miesiac: string
  ogolem: number
  razemWgGrup: number
  grupy: ReportGroup[]
  pozycje: ReportPosition[]
  zrodlo?: string
}

export type ParseResult =
  | { ok: true; report: PosReport; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[]; report?: PosReport }

/** Interfejs źródła raportu z kasy (PDF dziś, CSV/XLS w przyszłości). */
export interface ReportParser {
  nazwa: string
  akceptuje(plik: { name: string; type?: string }): boolean
  parse(data: ArrayBuffer | Uint8Array): Promise<ParseResult>
}
