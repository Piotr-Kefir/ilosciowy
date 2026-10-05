import { useEffect, useState } from 'react'
import { defaultState } from '../domain/defaults'
import type { AppState } from '../domain/types'
import { fmtDateTime, monthLabel } from '../format'
import { isInstalledApp, parseBackup, requestPersistence, type Persistence } from '../store'

export function BackupView({ state, replace, onBackup }: { state: AppState; replace: (s: AppState) => void; onBackup: () => void }) {
  const [msg, setMsg] = useState<string>()
  const [persist, setPersist] = useState<Persistence>('nieznane')
  useEffect(() => {
    void requestPersistence().then(setPersist)
  }, [])
  const installed = isInstalledApp()
  const months = Object.keys(state.months).sort()

  return (
    <div>
      <h2>Kopia zapasowa</h2>
      <p>
        Każda zmiana <strong>zapisuje się sama</strong> w tej przeglądarce na tym urządzeniu — nic nie trzeba klikać. Kopia to
        dodatkowy plik na wypadek zgubienia telefonu, wyczyszczenia przeglądarki albo przenosin na inne urządzenie. Pobieraj ją po
        każdym zamknięciu miesiąca i trzymaj w jednym folderze (np. iCloud Drive). Plik ma końcówkę <code>.ilosciowy</code> — nie
        trzeba go otwierać, tylko przechować.
      </p>
      <p>
        Przechowywanie w przeglądarce:{' '}
        <strong className={persist === 'trwałe' ? 'ok-line' : 'text-red'}>
          {persist === 'trwałe' ? 'trwałe — przeglądarka nie usunie danych sama' : 'nietrwałe — przeglądarka może usunąć dane'}
        </strong>
        {installed && <span className="muted"> · otwarte jako aplikacja z ekranu głównego</span>}
      </p>
      {!installed && (
        <div className="alert alert-yellow">
          <strong>Na telefonie dodaj tę stronę do ekranu głównego.</strong> Safari na iPhonie usuwa dane stron nieotwieranych przez
          ok. 7 dni — strona dodana do ekranu głównego jest chroniona.
          <ul>
            <li>iPhone (Safari): przycisk „Udostępnij” → „Do ekranu początkowego”.</li>
            <li>Android (Chrome): menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.</li>
          </ul>
          Potem otwieraj aplikację zawsze z tej ikony (dane z ikony i ze zwykłej karty przeglądarki mogą być osobne).
        </div>
      )}
      <p>
        Ostatnia kopia: <strong>{fmtDateTime(state.settings.ostatniaKopia)}</strong>
      </p>
      <p>
        W danych: {months.length ? months.map(monthLabel).join(', ') : 'brak miesięcy'}; faktur: {state.invoices.length}.
      </p>
      <button type="button" className="primary" onClick={onBackup}>
        Pobierz kopię
      </button>

      <h3>Wczytaj kopię</h3>
      <p className="muted">Zastępuje wszystkie obecne dane danymi z pliku.</p>
      <input
        type="file"
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
