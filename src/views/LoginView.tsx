import { useState } from 'react'
import { supabase } from '../cloud/client'

/** Logowanie 6-cyfrowym kodem z maila (link otworzyłby się w Safari, a nie w aplikacji z ekranu głównego). */
export function LoginView() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'kod'>('email')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  async function sendCode() {
    const e = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('Wpisz poprawny adres e-mail.')
    setBusy(true)
    setErr(undefined)
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) {
      if (/rate limit|too many/i.test(error.message))
        setErr('Wysłano już kilka kodów — odczekaj chwilę (do godziny) i spróbuj ponownie. Sprawdź też folder spam.')
      else setErr(`Nie udało się wysłać kodu: ${error.message}`)
      return
    }
    setEmail(e)
    setStep('kod')
  }

  async function verify() {
    const token = code.replace(/\s/g, '')
    if (!/^\d{6,10}$/.test(token)) return setErr('Wpisz kod z maila (same cyfry).')
    setBusy(true)
    setErr(undefined)
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    setBusy(false)
    if (error) setErr(/expired|invalid/i.test(error.message) ? 'Kod jest nieprawidłowy albo wygasł. Wyślij nowy.' : error.message)
  }

  return (
    <div className="login">
      <h1>Ilościowy</h1>
      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode()
          }}
        >
          <p>Zaloguj się adresem e-mail — wyślemy na niego kod.</p>
          <input type="email" autoComplete="email" placeholder="adres e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Wysyłam…' : 'Wyślij kod'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <p>
            Wpisz kod z maila wysłanego na <strong>{email}</strong>.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="kod z maila"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Sprawdzam…' : 'Zaloguj'}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep('email')
              setCode('')
              setErr(undefined)
            }}
          >
            Inny adres / wyślij nowy kod
          </button>
        </form>
      )}
      {err && <p className="text-red">{err}</p>}
      <p className="muted small">Logujesz się raz na każdym urządzeniu — potem aplikacja pamięta.</p>
    </div>
  )
}
