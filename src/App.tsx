import { useEffect, useState } from 'react'
import { nextMonth, prevMonth } from './domain/calc'
import type { AppState } from './domain/types'
import { fmtDateTime, monthLabel } from './format'
import { backupJson, downloadFile, requestPersistence, useAppState } from './store'
import { BackupView } from './views/BackupView'
import { InvoicesPanel } from './views/InvoicesPanel'
import { MonthView } from './views/MonthView'
import { PositionsView } from './views/PositionsView'
import { ProductsView } from './views/ProductsView'
import { RecipesView } from './views/RecipesView'

type Tab = 'miesiac' | 'faktury' | 'pozycje' | 'receptury' | 'produkty' | 'kopia'

const TABS: [Tab, string][] = [
  ['miesiac', 'Miesiąc'],
  ['faktury', 'Faktury'],
  ['pozycje', 'Pozycje z kasy'],
  ['receptury', 'Receptury kawy'],
  ['produkty', 'Produkty'],
  ['kopia', 'Kopia zapasowa'],
]

function initialMonth(s: AppState): string {
  const withReport = Object.values(s.months)
    .filter((m) => m.raport)
    .map((m) => m.miesiac)
    .sort()
  return withReport.at(-1) ?? '2026-08'
}

export default function App() {
  const { state, update, replace, error } = useAppState()
  const [tab, setTab] = useState<Tab>('miesiac')
  const [miesiac, setMiesiac] = useState<string | null>(null)
  useEffect(() => {
    void requestPersistence()
  }, [])

  if (!state) return <p className="loading">Wczytywanie…</p>
  const m = miesiac ?? initialMonth(state)

  function backup() {
    if (!state) return
    const now = new Date().toISOString()
    const s = { ...state, settings: { ...state.settings, ostatniaKopia: now } }
    downloadFile(`ilosciowy_kopia_${now.slice(0, 10)}.json`, backupJson(s), 'application/json')
    update((x) => ({ ...x, settings: { ...x.settings, ostatniaKopia: now } }))
  }

  const lastBackup = state.settings.ostatniaKopia
  const needsBackup = Object.values(state.months).some((x) => x.zamknietyAt && (!lastBackup || x.zamknietyAt > lastBackup))

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ilościowy</h1>
        <div className="month-picker">
          <button type="button" onClick={() => setMiesiac(prevMonth(m))} aria-label="Poprzedni miesiąc">
            ‹
          </button>
          <input type="month" value={m} onChange={(e) => e.target.value && setMiesiac(e.target.value)} aria-label="Miesiąc" />
          <button type="button" onClick={() => setMiesiac(nextMonth(m))} aria-label="Następny miesiąc">
            ›
          </button>
          <strong className="month-name">{monthLabel(m)}</strong>
        </div>
        <div className="backup-info">
          Ostatnia kopia: <span className={lastBackup ? '' : 'text-red'}>{fmtDateTime(lastBackup)}</span>{' '}
          <button type="button" onClick={backup}>
            Pobierz kopię
          </button>
        </div>
      </header>

      {error && <div className="alert alert-red">{error}</div>}
      {needsBackup && (
        <div className="alert alert-yellow banner">
          Miesiąc został zamknięty po ostatniej kopii.{' '}
          <button type="button" className="primary" onClick={backup}>
            Pobierz kopię teraz
          </button>
        </div>
      )}

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'miesiac' && (
          <MonthView state={state} update={update} miesiac={m} setMiesiac={setMiesiac} onBackup={backup} goToPositions={() => setTab('pozycje')} />
        )}
        {tab === 'faktury' && <InvoicesPanel state={state} update={update} miesiac={m} />}
        {tab === 'pozycje' && <PositionsView state={state} update={update} miesiac={m} />}
        {tab === 'receptury' && <RecipesView state={state} update={update} />}
        {tab === 'produkty' && <ProductsView state={state} update={update} />}
        {tab === 'kopia' && <BackupView state={state} replace={replace} onBackup={backup} />}
      </main>
    </div>
  )
}
