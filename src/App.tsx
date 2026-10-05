import { useEffect, useState } from 'react'
import { nextMonth, prevMonth } from './domain/calc'
import type { AppState } from './domain/types'
import { monthLabel } from './format'
import { useCloudApp } from './cloud/useCloudApp'
import type { SyncStatus } from './cloud/sync'
import { backupJson, downloadFile, requestPersistence } from './store'
import { LoginView } from './views/LoginView'
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
  ['kopia', 'Kopia i historia'],
]

function initialMonth(s: AppState): string {
  const withReport = Object.values(s.months)
    .filter((m) => m.raport)
    .map((m) => m.miesiac)
    .sort()
  return withReport.at(-1) ?? '2026-08'
}

function StatusBadge({ status }: { status?: SyncStatus }) {
  if (!status) return null
  const time = (d: Date) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  if (status.kind === 'zapisane')
    return (
      <span className="saved" title="Każda zmiana zapisuje się sama w chmurze">
        ✓ Zapisane w chmurze {time(status.at)}
      </span>
    )
  if (status.kind === 'zapisywanie') return <span className="muted">Zapisywanie…</span>
  if (status.kind === 'offline')
    return (
      <span className="warn-text" title="Zmiany są na tym urządzeniu i wyślą się same">
        Brak internetu — zapisze się, gdy wróci
      </span>
    )
  return <span className="text-red">{status.message}</span>
}

export default function App() {
  const { phase, state, update, replace, status, info, dismissInfo, signOut, recovered } = useCloudApp()
  const [tab, setTab] = useState<Tab>('miesiac')
  const [miesiac, setMiesiac] = useState<string | null>(null)
  useEffect(() => {
    void requestPersistence()
  }, [])

  if (phase.kind === 'logowanie') return <LoginView />
  if (phase.kind === 'nowe hasło') return <LoginView recovery onRecovered={() => void recovered()} />
  if (phase.kind === 'brak dostępu')
    return (
      <div className="login">
        <h1>Ilościowy</h1>
        <p>
          Adres <strong>{phase.email}</strong> nie ma dostępu do danych kawiarni.
        </p>
        <button type="button" onClick={() => void signOut()}>
          Wyloguj
        </button>
      </div>
    )
  if (phase.kind === 'błąd') return <p className="loading text-red">{phase.message}</p>
  if (!state || phase.kind !== 'gotowe') return <p className="loading">Wczytywanie…</p>
  const m = miesiac ?? initialMonth(state)

  function backup() {
    if (!state) return
    const now = new Date().toISOString()
    // Własna końcówka pliku, żeby system nie otwierał kopii w innym programie (np. jako JSON).
    downloadFile(`ilosciowy_kopia_${now.slice(0, 10)}.ilosciowy`, backupJson(state), 'application/octet-stream')
  }

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
          <StatusBadge status={status} />
        </div>
      </header>

      {info && (
        <div className="alert alert-yellow">
          {info}{' '}
          <button type="button" onClick={dismissInfo}>
            OK
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
          <MonthView state={state} update={update} miesiac={m} setMiesiac={setMiesiac} goToPositions={() => setTab('pozycje')} />
        )}
        {tab === 'faktury' && <InvoicesPanel state={state} update={update} miesiac={m} />}
        {tab === 'pozycje' && <PositionsView state={state} update={update} miesiac={m} />}
        {tab === 'receptury' && <RecipesView state={state} update={update} />}
        {tab === 'produkty' && <ProductsView state={state} update={update} />}
        {tab === 'kopia' && <BackupView state={state} replace={replace} onBackup={backup} email={phase.email} onSignOut={signOut} />}
      </main>
    </div>
  )
}
