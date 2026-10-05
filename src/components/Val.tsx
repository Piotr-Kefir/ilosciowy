import type { ReactNode } from 'react'
import type { Val } from '../domain/calc'

/** Wartość albo szary napis „czeka na: …” (nigdy zero ani błąd). */
export function ValView({
  v,
  fmt,
  waitLabel = 'czeka na',
  compact,
}: {
  v: Val
  fmt: (n: number) => ReactNode
  waitLabel?: string
  /** Zamiast listy braków pokaż „—” z listą w podpowiedzi. */
  compact?: boolean
}) {
  if (v.ok) return <>{fmt(v.v)}</>
  if (compact)
    return (
      <span className="waiting" title={`${waitLabel}: ${v.brak.join(', ')}`}>
        —
      </span>
    )
  return (
    <span className="waiting">
      {waitLabel}: {v.brak.join(', ')}
    </span>
  )
}

export function Badge({ kind, children, title }: { kind: 'new' | 'assumption' | 'muted' | 'ok'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${kind}`} title={title}>
      {children}
    </span>
  )
}
