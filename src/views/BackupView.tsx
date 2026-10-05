import { useState } from 'react'
import { defaultState } from '../domain/defaults'
import type { AppState } from '../domain/types'
import { fmtDateTime, monthLabel } from '../format'
import { parseBackup } from '../store'

export function BackupView({ state, replace, onBackup }: { state: AppState; replace: (s: AppState) => void; onBackup: () => void }) {
  const [msg, setMsg] = useState<string>()
  const months = Object.keys(state.months).sort()

  return (
    <div>
      <h2>Kopia zapasowa</h2>
      <p>
        Dane są zapisane <strong>tylko w tej przeglądarce na tym urządzeniu</strong>. Kopia (plik JSON) to jedyny sposób, żeby je
        przenieść na inne urządzenie albo odzyskać po wyczyszczeniu przeglądarki. Pobieraj ją po każdym zamknięciu miesiąca.
      </p>
      <p>
        Ostatnia kopia: <strong>{fmtDateTime(state.settings.ostatniaKopia)}</strong>
      </p>
      <p>
        W danych: {months.length ? months.map(monthLabel).join(', ') : 'brak miesięcy'}; faktur: {state.invoices.length}.
      </p>
      <button type="button" className="primary" onClick={onBackup}>
        Pobierz kopię (JSON)
      </button>

      <h3>Wczytaj kopię</h3>
      <p className="muted">Zastępuje wszystkie obecne dane danymi z pliku.</p>
      <input
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const s = parseBackup(await f.text())
            if (!window.confirm(`Zastąpić obecne dane kopią z pliku ${f.name}?`)) return
            replace(s)
            setMsg(`Wczytano kopię ${f.name}.`)
          } catch (err) {
            setMsg((err as Error).message)
          }
        }}
      />
      {msg && <p className="alert alert-grey">{msg}</p>}

      <h3>Zacznij od nowa</h3>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (window.confirm('Usunąć WSZYSTKIE dane i wrócić do ustawień domyślnych? Najpierw pobierz kopię.')) replace(defaultState())
        }}
      >
        Wyczyść wszystkie dane
      </button>
    </div>
  )
}
