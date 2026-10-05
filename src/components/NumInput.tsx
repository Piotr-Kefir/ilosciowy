import { useState } from 'react'
import { evalExpr } from '../domain/expr'
import type { NumField } from '../domain/types'
import { fmtNum } from '../format'

interface Props {
  value?: NumField
  onChange: (v: NumField | undefined) => void
  decimals?: number
  placeholder?: string
  /** Jednostka pomocnicza (np. porcja = 0,07 kg) — przełącznik obok pola. */
  pomocnicza?: { nazwa: string; ile: number }
  jednostka?: string
  ariaLabel?: string
  className?: string
}

/**
 * Pole liczbowe przyjmujące wyrażenia („316+175”). Po wyjściu z pola pokazuje wynik,
 * pod spodem — wyrażenie, z którego powstał. Puste pole = brak wartości (nie zero).
 */
export function NumInput({ value, onChange, decimals = 2, placeholder = '—', pomocnicza, jednostka, ariaLabel, className }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const [usePom, setUsePom] = useState<boolean>(!!value?.pomocnicza)
  const pomActive = !!pomocnicza && (editing !== null ? usePom : !!value?.pomocnicza)

  function commit(text: string) {
    const t = text.trim()
    if (!t) {
      setError(undefined)
      setEditing(null)
      onChange(undefined)
      return
    }
    const r = evalExpr(t)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(undefined)
    setEditing(null)
    const pom = !!pomocnicza && usePom
    onChange({ expr: t, value: pom ? r.value * pomocnicza!.ile : r.value, ...(pom ? { pomocnicza: true } : {}) })
  }

  const shown = value ? (value.pomocnicza && pomocnicza ? value.value / pomocnicza.ile : value.value) : undefined
  const display = editing ?? (shown !== undefined ? fmtNum(shown, decimals, true) : '')
  const plain = value && evalExpr(value.expr).ok && /^[\d\s,.-]+$/.test(value.expr.trim())
  const hint =
    value && !editing
      ? [
          !plain ? `= ${value.expr}` : '',
          value.pomocnicza && pomocnicza ? `${fmtNum(value.value, 3, true)} ${jednostka ?? ''}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  return (
    <span className={`num-input ${className ?? ''}`}>
      <span className="num-input-row">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          aria-label={ariaLabel}
          className={error ? 'invalid' : undefined}
          title={error}
          placeholder={placeholder}
          value={display}
          onFocus={(e) => {
            setUsePom(!!value?.pomocnicza)
            setEditing(value?.expr ?? '')
            requestAnimationFrame(() => e.target.select())
          }}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setEditing(null)
              setError(undefined)
            }
          }}
        />
        {pomocnicza && (
          <button
            type="button"
            className="unit-toggle"
            title="Przełącz jednostkę wpisywania"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const next = !(editing !== null ? usePom : !!value?.pomocnicza)
              setUsePom(next)
              if (editing === null && value) {
                const base = value.pomocnicza ? value.value / pomocnicza.ile : value.value
                const v = next ? base * pomocnicza.ile : base
                onChange({ expr: value.expr, value: v, ...(next ? { pomocnicza: true } : {}) })
              }
            }}
          >
            {pomActive ? pomocnicza.nazwa : jednostka}
          </button>
        )}
      </span>
      {error ? <span className="hint err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </span>
  )
}
