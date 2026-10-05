import { useState } from 'react'
import { Badge } from '../components/Val'
import { importReport } from '../domain/actions'
import { analyzePositions } from '../domain/mapping'
import type { AppState } from '../domain/types'
import { fmtNum, fmtZl, monthLabel } from '../format'
import type { ParseResult } from '../parser/types'
import type { Updater } from '../store'

type Stage = { kind: 'idle' } | { kind: 'parsing'; name: string } | { kind: 'preview'; name: string; res: ParseResult }

export function ImportBox({ state, update, onImported }: { state: AppState; update: Updater; onImported: (miesiac: string) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [drag, setDrag] = useState(false)

  async function handleFile(file: File) {
    setStage({ kind: 'parsing', name: file.name })
    const { parsers } = await import('../parser/browser')
    const parser = parsers.find((p) => p.akceptuje(file))
    if (!parser) {
      setStage({
        kind: 'preview',
        name: file.name,
        res: { ok: false, errors: ['Ten typ pliku nie jest obsługiwany. Wrzuć PDF z kasy („Raport zmiany okresowy”).'], warnings: [] },
      })
      return
    }
    const res = await parser.parse(await file.arrayBuffer())
    setStage({ kind: 'preview', name: file.name, res })
  }

  function confirm() {
    if (stage.kind !== 'preview' || !stage.res.ok) return
    const r = stage.res.report
    if (state.months[r.miesiac]?.raport) {
      const ok = window.confirm(
        `Raport za ${monthLabel(r.miesiac)} jest już wczytany. Nadpisać go nowym?\n\nWpisy ręczne (faktury, stany, straty, pracownicy) zostaną bez zmian.`,
      )
      if (!ok) return
    }
    update((s) => importReport(s, r))
    setStage({ kind: 'idle' })
    onImported(r.miesiac)
  }

  return (
    <>
      <label
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) void handleFile(f)
        }}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void handleFile(f)
          }}
        />
        {stage.kind === 'parsing' ? `Czytam ${stage.name}…` : 'Wrzuć raport z kasy (PDF) — przeciągnij tutaj albo kliknij'}
      </label>
      {stage.kind === 'preview' && (
        <ImportPreview state={state} name={stage.name} res={stage.res} onCancel={() => setStage({ kind: 'idle' })} onConfirm={confirm} />
      )}
    </>
  )
}

function ImportPreview({
  state,
  name,
  res,
  onCancel,
  onConfirm,
}: {
  state: AppState
  name: string
  res: ParseResult
  onCancel: () => void
  onConfirm: () => void
}) {
  const r = res.report
  const info = r ? analyzePositions(importReport(state, r), r.pozycje, r.miesiac) : []
  const nowe = info.filter((i) => i.nowa)
  const exists = r && state.months[r.miesiac]?.raport

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Podgląd importu">
        <h2>Podgląd: {name}</h2>
        {r && (
          <dl className="kv">
            <dt>Miesiąc</dt>
            <dd>{monthLabel(r.miesiac)}</dd>
            <dt>Zakres dat</dt>
            <dd>{r.zakresTekst}</dd>
            <dt>Ogółem</dt>
            <dd>{fmtZl(r.ogolem)}</dd>
            <dt>Razem wg grup</dt>
            <dd>{fmtZl(r.razemWgGrup)}</dd>
            <dt>Pozycji</dt>
            <dd>
              {r.pozycje.length} w {r.grupy.length} grupach
            </dd>
          </dl>
        )}
        {res.ok ? (
          <p className="ok-line">✓ Sumy pozycji zgadzają się z grupami, suma grup z „Razem”.</p>
        ) : (
          <div className="alert alert-red">
            <strong>Nie można wczytać — błąd odczytu raportu:</strong>
            <ul>
              {res.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {res.warnings.length > 0 && (
          <div className="alert alert-yellow">
            <ul>
              {res.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {exists && <p className="alert alert-yellow">Ten miesiąc ma już raport — zatwierdzenie go nadpisze (wpisy ręczne zostają).</p>}
        {nowe.length > 0 && (
          <>
            <h3>Nowe pozycje ({nowe.length})</h3>
            <table className="mini">
              <tbody>
                {nowe.map((i) => (
                  <tr key={i.pozycja.posKey + i.pozycja.ilosc}>
                    <td>
                      <Badge kind="new">NOWE</Badge>
                    </td>
                    <td>gr. {i.pozycja.grupa}</td>
                    <td>{i.pozycja.nazwa}</td>
                    <td className="num">{fmtNum(i.pozycja.ilosc, 0)} szt.</td>
                    <td>
                      {i.status === 'przypisana' ? (
                        <Badge kind="ok">przypisana</Badge>
                      ) : i.alarm ? (
                        <span className="text-red">bez przypisania — do decyzji</span>
                      ) : (
                        <span className="muted">bez przypisania</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Anuluj
          </button>
          <button type="button" className="primary" disabled={!res.ok} onClick={onConfirm}>
            Zatwierdź
          </button>
        </div>
      </div>
    </div>
  )
}
