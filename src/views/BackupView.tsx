import { useEffect, useState } from 'react'
import { loadHistory, loadHistoryState, supabaseRemote, type HistoryEntry } from '../cloud/client'
import type { AppState } from '../domain/types'
import { fmtDateTime, monthLabel } from '../format'
import { isInstalledApp, migrate, parseBackup } from '../store'

interface Props {
  state: AppState
  replace: (s: AppState) => void
  onBackup: () => void
  email: string
  onSignOut: () => Promise<void>
}

export function BackupView({ state, replace, onBackup, email, onSignOut }: Props) {
  const [msg, setMsg] = useState<string>()
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [historyErr, setHistoryErr] = useState<string>()
  const months = Object.keys(state.months).sort()

  const refresh = () =>
    loadHistory()
      .then((h) => {
        setHistory(h)
        setHistoryErr(undefined)
      })
      .catch(() => setHistoryErr('Nie udało się wczytać historii (brak internetu?).'))

  useEffect(() => {
    void refresh()
  }, [])

  async function restore(h: HistoryEntry) {
    if (!window.confirm(`Przywrócić wersję z ${fmtDateTime(h.saved_at)}?\n\nObecna wersja zostanie zachowana w historii.`)) return
    try {
      const data = migrate(await loadHistoryState(h.id))
      await supabaseRemote.archive(state, 'Wersja sprzed przywrócenia starszej')
      replace(data)
      setMsg(`Przywrócono wersję z ${fmtDateTime(h.saved_at)}.`)
      void refresh()
    } catch (e) {
      setMsg(`Nie udało się przywrócić: ${(e as Error).message}`)
    }
  }

  return (
    <div>
      <h2>Dane w chmurze</h2>
      <p>
        Każda zmiana <strong>zapisuje się sama w chmurze</strong> — nic nie trzeba klikać. Te same dane widać na każdym urządzeniu
        po zalogowaniu. Bez internetu aplikacja dalej działa, a zmiany wyślą się, gdy internet wróci.
      </p>
      <p className="muted">
        W danych: {months.length ? months.map(monthLabel).join(', ') : 'brak miesięcy'}; faktur: {state.invoices.length}.
      </p>
      {!isInstalledApp() && (
        <p className="muted small">
          Wygodniej z ikony na ekranie głównym: iPhone — „Udostępnij” → „Do ekranu początkowego”; Android — menu ⋮ → „Dodaj do ekranu
          głównego”; Mac (Safari) — Plik → „Dodaj do Docka”.
        </p>
      )}

      <h2>Historia wersji</h2>
      <p className="muted">
        Chmura sama odkłada poprzednią wersję co najwyżej raz na godzinę pracy. Jeśli coś się popsuje, przywróć wcześniejszą wersję.
      </p>
      {historyErr && <p className="text-red">{historyErr}</p>}
      {history && history.length === 0 && <p className="muted">Jeszcze nie ma wcześniejszych wersji.</p>}
      {history && history.length > 0 && (
        <div className="table-scroll">
          <table className="grid history-list">
            <thead>
              <tr>
                <th>Kiedy</th>
                <th>Kto</th>
                <th>Opis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDateTime(h.saved_at)}</td>
                  <td className="muted">{h.saved_by ?? ''}</td>
                  <td className="muted">{h.note ?? 'automatycznie'}</td>
                  <td>
                    <button type="button" onClick={() => void restore(h)}>
                      Przywróć
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className="alert alert-grey">{msg}</p>}

      <h2>Kopia w pliku (opcjonalnie)</h2>
      <p className="muted">Niepotrzebna na co dzień — dla spokoju albo do archiwum. Plik ma końcówkę .ilosciowy.</p>
      <button type="button" onClick={onBackup}>
        Pobierz kopię do pliku
      </button>{' '}
      <label className="check">
        Wczytaj kopię z pliku:{' '}
        <input
          type="file"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const s = parseBackup(await f.text())
              if (!window.confirm(`Zastąpić obecne dane kopią z pliku ${f.name}?\n\nObecna wersja zostanie zachowana w historii.`)) return
              await supabaseRemote.archive(state, `Wersja sprzed wczytania pliku ${f.name}`).catch(() => undefined)
              replace(s)
              setMsg(`Wczytano kopię ${f.name}.`)
            } catch (err) {
              setMsg((err as Error).message)
            }
          }}
        />
      </label>

      <h2>Konto</h2>
      <p>
        Zalogowano jako <strong>{email}</strong>.{' '}
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Wylogować? Dane zostają w chmurze — po zalogowaniu wrócą.')) void onSignOut()
          }}
        >
          Wyloguj
        </button>
      </p>
    </div>
  )
}
