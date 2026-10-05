// Generuje src/domain/seed-seen.json: pozycje z raportów w fixtures/ do miesiąca podanego jako argument (domyślnie 2026-07).
// Użycie: npx tsx scripts/dump-positions.ts 2026-07
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createPdfReportParser } from '../src/parser/pdf'

const dir = join(import.meta.dirname, '..', 'fixtures')
const parser = createPdfReportParser(pdfjs as unknown as typeof import('pdfjs-dist'))
const doMiesiaca = process.argv[2] ?? '2026-07'
const seen: Record<string, { posKey: string; pierwszyMiesiac: string; ostatniaNazwaOryginalna: string }> = {}
for (const f of readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
  const res = await parser.parse(readFileSync(join(dir, f)))
  if (!res.ok) throw new Error(f + res.errors.join())
  if (res.report.miesiac > doMiesiaca) continue
  for (const p of res.report.pozycje) {
    const s = (seen[p.posKey] ??= { posKey: p.posKey, pierwszyMiesiac: res.report.miesiac, ostatniaNazwaOryginalna: p.nazwa })
    s.ostatniaNazwaOryginalna = p.nazwa
  }
}
const out = join(import.meta.dirname, '..', 'src', 'domain', 'seed-seen.json')
writeFileSync(out, JSON.stringify(Object.values(seen), null, 1) + '\n')
console.log(`${Object.keys(seen).length} pozycji → ${out}`)
