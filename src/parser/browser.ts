// Wersja „legacy” pdfjs: zwykła wymaga najnowszych przeglądarek (np. iterowania strumieni),
// a starsze Safari kończy się wtedy błędem „undefined is not a function”.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createPdfReportParser } from './pdf'
import type { ReportParser } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Dostępne źródła raportu. Import CSV/XLS — dopisać tutaj kolejny ReportParser. */
export const parsers: ReportParser[] = [createPdfReportParser(pdfjs as unknown as typeof import('pdfjs-dist'))]
