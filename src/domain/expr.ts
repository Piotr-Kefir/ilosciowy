/**
 * Proste wyrażenia w polach liczbowych: „316+175”, „1,25+0,133+2,855”, „(2+1)*0,07”.
 * Przecinek albo kropka jako separator dziesiętny, spacje ignorowane.
 */
export type ExprResult = { ok: true; value: number } | { ok: false; error: string }

export function evalExpr(input: string): ExprResult {
  const src = input.replace(/\s+/g, '').replace(/,/g, '.')
  if (!src) return { ok: false, error: 'puste pole' }
  let i = 0

  const peek = () => src[i]
  function number(): number | null {
    const m = src.slice(i).match(/^\d+(?:\.\d+)?|^\.\d+/)
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }
  function factor(): number | null {
    if (peek() === '-') {
      i++
      const f = factor()
      return f === null ? null : -f
    }
    if (peek() === '+') {
      i++
      return factor()
    }
    if (peek() === '(') {
      i++
      const v = expr()
      if (v === null || peek() !== ')') return null
      i++
      return v
    }
    return number()
  }
  function term(): number | null {
    let v = factor()
    while (v !== null && (peek() === '*' || peek() === '/' || peek() === 'x' || peek() === '×')) {
      const op = src[i++]
      const r = factor()
      if (r === null) return null
      v = op === '/' ? v / r : v * r
    }
    return v
  }
  function expr(): number | null {
    let v = term()
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++]
      const r = term()
      if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  const v = expr()
  if (v === null || i !== src.length) return { ok: false, error: `nie rozumiem „${input}”` }
  if (!Number.isFinite(v)) return { ok: false, error: 'wynik nie jest liczbą' }
  return { ok: true, value: Math.round(v * 1e9) / 1e9 }
}
