import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { FaqList } from "@/components/faq-list";

export const metadata: Metadata = {
  title: "FAQ — Fairway Studio",
  description:
    "Answers about Fairway Studio by JL Influence: onboarding, projects, saving work, offline drafts, installing the app, and getting support.",
};

export default function FaqPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-10 sm:px-8 md:py-16">
        <header className="flex flex-col gap-4">
          <Link
            href="/demo"
            className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to the studio
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Fairway Studio</p>
          <h1 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">Frequently asked questions</h1>
          <p className="max-w-prose text-pretty leading-relaxed text-muted-foreground">
            Quick answers for Jafar and Liz&apos;s shared creative workspace. If something isn&apos;t covered here, reach out
            and we&apos;ll add it.
          </p>
        </header>

        <FaqList />

        <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Still stuck?</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Email us and include what you were trying to do and which page you were on.
            </p>
          </div>
          <a
            href="mailto:jafar@jlinfluence.com?subject=Fairway%20Studio%20support"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Mail className="size-4" aria-hidden="true" /> jafar@jlinfluence.com
          </a>
        </aside>
      </div>
    </main>
  );
}
