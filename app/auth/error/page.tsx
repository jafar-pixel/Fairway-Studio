import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Fairway Studio</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">That sign-in link didn&apos;t work</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">It may have expired or already been used. Return to the studio and request a fresh link.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground">Back to the studio</Link>
      </section>
    </main>
  )
}
