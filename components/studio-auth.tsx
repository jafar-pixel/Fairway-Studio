'use client'

import { useState, type FormEvent } from 'react'
import { Check, Flag, LoaderCircle, Mail, LockKeyhole, UserRound } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'

function authMessage(message: string, status?: number) {
  const normalized = message.toLowerCase()
  if (normalized.includes('not confirmed') || normalized.includes('not verified')) {
    return 'Confirm your email using the link we sent, then come back to sign in.'
  }
  if (normalized.includes('password') && (normalized.includes('weak') || normalized.includes('length'))) {
    return 'Choose a stronger password with at least 8 characters.'
  }
  if (status === 429 || normalized.includes('rate limit')) {
    return 'Too many attempts. Wait a little while and try again.'
  }
  if (normalized.includes('invalid login credentials') || normalized.includes('user already registered')) {
    return 'We couldn’t verify those details. Check your email and password, or try signing in.'
  }
  return 'We couldn’t complete that request. Please try again.'
}

export function StudioAuth({ invitePending = false }: { invitePending?: boolean }) {
  const { mutate } = useSWRConfig()
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = createClient()
    setBusy(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'signup') {
        const callback = new URL(
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        )
        callback.searchParams.set('next', `${window.location.pathname}${window.location.search}`)
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: callback.toString(),
            data: { display_name: displayName.trim() },
          },
        })
        if (signUpError) throw signUpError
        if (data.user && data.session) {
          await mutate('studio-user', data.user)
        } else {
          setMessage('Check your inbox for a confirmation link. Once you confirm, you can open your shared studio.')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
        const { data, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        await mutate('studio-user', data.user)
      }
    } catch (caught) {
      const authError = caught as { message?: string; status?: number }
      setError(authMessage(authError.message ?? '', authError.status))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-[980px] overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm md:grid md:grid-cols-[0.92fr_1.08fr]">
        <section className="flex flex-col justify-between bg-primary p-7 text-primary-foreground md:p-10">
          <div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-foreground/10"><Flag className="size-5" /></span>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">Fairway Studio · Golf, first</p>
            <h1 className="mt-4 max-w-sm text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl">A good idea gets better when the whole team can build on it.</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-primary-foreground/70">Keep the brand thinking, visual references, and next moves in one private workspace for your founding team.</p>
          </div>
          <p className="mt-12 text-xs leading-relaxed text-primary-foreground/55">Your ideas are visible only to signed-in members of your workspace.</p>
        </section>

        <section className="p-7 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{mode === 'signup' ? 'Start building together.' : 'Sign in to your studio.'}</h2>
          {invitePending && <p className="mt-3 rounded-xl bg-secondary px-3.5 py-3 text-sm leading-relaxed text-secondary-foreground">You have a team invitation. Sign in or create an account to accept it.</p>}
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="flex flex-col gap-2 text-sm font-medium">
                Your name
                <span className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required maxLength={80} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Jafar" /></span>
              </label>
            )}
            <label className="flex flex-col gap-2 text-sm font-medium">
              Email address
              <span className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="you@example.com" /></span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Password
              <span className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required minLength={8} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="At least 8 characters" /></span>
            </label>
            {error && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-relaxed text-destructive">{error}</p>}
            {message && <p role="status" className="flex items-start gap-2 rounded-xl border border-primary/20 bg-secondary px-3.5 py-3 text-sm leading-relaxed text-secondary-foreground"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{message}</p>}
            <button type="submit" disabled={busy} className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === 'signup' ? 'Already have an account?' : 'New to the team?'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setMessage('') }} className="font-medium text-primary underline-offset-4 hover:underline">{mode === 'signup' ? 'Sign in' : 'Create an account'}</button>
          </p>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">By continuing, you agree to use this private studio for your team&apos;s brand collaboration.</p>
        </section>
      </div>
    </main>
  )
}
