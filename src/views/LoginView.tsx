import { useState } from 'react'
import { supabase } from '../cloud/client'

const SITE = 'https://piotr-kefir.github.io/ilosciowy/'

type Mode = 'login' | 'rejestracja' | 'reset' | 'nowe hasło'

function plError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Zły e-mail albo hasło.'
  if (/email not confirmed/i.test(msg)) return 'Najpierw kliknij link potwierdzający w mailu (sprawdź też spam).'
  if (/already registered|already been registered/i.test(msg)) return 'To konto już istnieje — zaloguj się albo użyj „Nie pamiętam hasła”.'
  if (/password should be at least|weak password/i.test(msg)) return 'Hasło musi mieć co najmniej 6 znaków.'
  if (/rate limit|too many/i.test(msg)) return 'Za dużo prób albo maili — odczekaj chwilę (do godziny) i spróbuj ponownie.'
  return msg
}

/**
 * Logowanie e-mailem i hasłem. Hasło ustawia się raz; mail przychodzi tylko przy zakładaniu konta
 * (link potwierdzający) i przy resecie hasła. Dostęp do danych mają tylko adresy z listy w bazie.
 */
export function LoginView({ recovery = false, onRecovered }: { recovery?: boolean; onRecovered?: () => void }) {
  const [mode, setMode] = useState<Mode>(recovery ? 'nowe hasło' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [done, setDone] = useState<string>()

  async function submit() {
    const e = email.trim().toLowerCase()
    if (mode !== 'nowe hasło' && !/^\S+@\S+\.\S+$/.test(e)) return setErr('Wpisz poprawny adres e-mail.')
    if ((mode === 'login' || mode === 'rejestracja' || mode === 'nowe hasło') && password.length < 6)
      return setErr('Hasło musi mieć co najmniej 6 znaków.')
    setBusy(true)
    setErr(undefined)
    setDone(undefined)
    let error: { message: string } | null = null
    if (mode === 'login') {
      ;({ error } = await supabase.auth.signInWithPassword({ email: e, password }))
    } else if (mode === 'rejestracja') {
      ;({ error } = await supabase.auth.signUp({ email: e, password, options: { emailRedirectTo: SITE } }))
      if (!error) setDone(`Wysłaliśmy mail na ${e}. Kliknij w nim link potwierdzający, potem wróć tutaj i zaloguj się hasłem.`)
    } else if (mode === 'reset') {
      ;({ error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: SITE }))
      if (!error) setDone(`Jeśli konto istnieje, na ${e} przyszedł mail z linkiem do ustawienia nowego hasła.`)
    } else {
      ;({ error } = await supabase.auth.updateUser({ password }))
      if (!error) onRecovered?.()
    }
    setBusy(false)
    if (error) setErr(plError(error.message))
  }

  const title = {
    login: 'Zaloguj się',
    rejestracja: 'Pierwsze logowanie — ustaw hasło',
    reset: 'Nie pamiętam hasła',
    'nowe hasło': 'Ustaw nowe hasło',
  }[mode]
  const button = { login: 'Zaloguj', rejestracja: 'Ustaw hasło', reset: 'Wyślij link', 'nowe hasło': 'Zapisz hasło' }[mode]
  const switchTo = (m: Mode) => {
    setMode(m)
    setErr(undefined)
    setDone(undefined)
  }

  return (
    <div className="login">
      <h1>Ilościowy</h1>
      <h2>{title}</h2>
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          void submit()
        }}
      >
        {mode !== 'nowe hasło' && (
          <input type="email" autoComplete="email" placeholder="adres e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        {mode !== 'reset' && (
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'login' ? 'hasło' : 'nowe hasło (min. 6 znaków)'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Chwileczkę…' : button}
        </button>
      </form>
      {err && <p className="text-red">{err}</p>}
      {done && <p className="alert alert-grey">{done}</p>}
      {mode === 'login' && (
        <p>
          <button type="button" className="link" onClick={() => switchTo('rejestracja')}>
            Pierwszy raz? Ustaw hasło
          </button>
          <br />
          <button type="button" className="link" onClick={() => switchTo('reset')}>
            Nie pamiętam hasła
          </button>
        </p>
      )}
      {(mode === 'rejestracja' || mode === 'reset') && (
        <p>
          <button type="button" className="link" onClick={() => switchTo('login')}>
            ← Wróć do logowania
          </button>
        </p>
      )}
      <p className="muted small">Logujesz się raz na każdym urządzeniu — potem aplikacja pamięta.</p>
    </div>
  )
}
