import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createPdfReportParser } from './pdf'
import type { ReportParser } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Dostępne źródła raportu. Import CSV/XLS — dopisać tutaj kolejny ReportParser. */
export const parsers: ReportParser[] = [createPdfReportParser(pdfjs)]
