import { parseReportItems } from './layout'
import type { ParseResult, ReportParser, TextItem } from './types'

/** Minimalny wycinek API pdfjs-dist, wspólny dla wersji przeglądarkowej i node (legacy). */
type PdfjsLib = typeof import('pdfjs-dist')

export async function extractTextItems(
  pdfjs: PdfjsLib,
  data: ArrayBuffer | Uint8Array,
): Promise<{ items: TextItem[]; producer?: string }> {
  // pdfjs przejmuje bufor na własność — przekazujemy kopię.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice()
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0 })
  const doc = await task.promise
  const items: TextItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    for (const it of tc.items) {
      if (!('str' in it)) continue
      items.push({ page: p, str: it.str, x: it.transform[4], y: it.transform[5], width: it.width })
    }
  }
  let producer: string | undefined
  try {
    const meta = await doc.getMetadata()
    const info = meta.info as Record<string, unknown>
    producer = [info.Producer, info.Creator].filter(Boolean).join(' / ') || undefined
  } catch {
    /* metadane są tylko informacyjne */
  }
  await task.destroy()
  return { items, producer }
}

export function createPdfReportParser(pdfjs: PdfjsLib): ReportParser {
  return {
    nazwa: 'PDF z kasy (SMALL BUSINESS)',
    akceptuje: (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    async parse(data): Promise<ParseResult> {
      let extracted
      try {
        extracted = await extractTextItems(pdfjs, data)
      } catch (e) {
        return { ok: false, errors: [`Nie udało się odczytać PDF: ${(e as Error).message}`], warnings: [] }
      }
      return parseReportItems(extracted.items, extracted.producer)
    },
  }
}
