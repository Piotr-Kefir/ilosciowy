/** Klucz nazwy pozycji: lowercase, trim, pojedyncze spacje, `+x` → `+ x`. */
export function normalizeName(nazwa: string): string {
  return nazwa
    .toLocaleLowerCase('pl')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\+\s*/, '+ ')
}

export function posKeyOf(grupa: number, nazwa: string): string {
  return `${grupa}|${normalizeName(nazwa)}`
}

export function splitPosKey(posKey: string): { grupa: number; nazwa: string } {
  const i = posKey.indexOf('|')
  return { grupa: Number(posKey.slice(0, i)), nazwa: posKey.slice(i + 1) }
}
