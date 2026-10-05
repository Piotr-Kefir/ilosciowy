import './streamPolyfill'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createPdfReportParser } from './pdf'
import type { ReportParser } from './types'

// Własny worker (z łatką iteracji strumieni dla Safari) zamiast domyślnego z pdfjs.
pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfWorker.ts', import.meta.url), { type: 'module' })

/** Dostępne źródła raportu. Import CSV/XLS — dopisać tutaj kolejny ReportParser. */
export const parsers: ReportParser[] = [createPdfReportParser(pdfjs as unknown as typeof import('pdfjs-dist'))]
