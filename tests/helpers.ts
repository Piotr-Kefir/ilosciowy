import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createPdfReportParser } from '../src/parser/pdf'
import type { ParseResult, PosReport } from '../src/parser/types'

export const FIXTURES = join(__dirname, '..', 'fixtures')

const parser = createPdfReportParser(pdfjs as unknown as typeof import('pdfjs-dist'))

export function parseFixture(miesiac: string): Promise<ParseResult> {
  return parser.parse(readFileSync(join(FIXTURES, `ilosciowy_${miesiac.slice(5)}.2026.pdf`)))
}

export async function reportFor(miesiac: string): Promise<PosReport> {
  const r = await parseFixture(miesiac)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.report
}
