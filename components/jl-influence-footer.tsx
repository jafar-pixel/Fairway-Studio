"use client";

import Link from "next/link";
import { CircleHelp, RotateCcw } from "lucide-react";
import { usePathname } from "next/navigation";
import { PwaControls } from "@/components/studio/pwa-controls";

const helpButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background";

export function JLInfluenceFooter() {
  const pathname = usePathname();
  const isStudioRoute = pathname === "/demo" || pathname.startsWith("/demo/") || pathname.startsWith("/w/");

  return (
    <footer
      data-studio={isStudioRoute ? (pathname.startsWith("/demo") ? "demo" : "") : undefined}
      className="fs-site-footer border-t-2 border-primary bg-foreground px-5 py-2 pb-24 text-background md:px-8 md:pb-2"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <a href="/" aria-label="Fairway Studio by JL Influence" className="block w-full max-w-sm shrink-0">
          <img
            src="/brand/jl-footer-banner.png"
            alt="JL Influence — Fairway Studio · © 2010 jlinfluence.com · All rights reserved"
            width={425}
            height={154}
            className="h-auto w-full"
          />
        </a>
        <div className="flex flex-col gap-2 lg:items-end">
          <address className="flex flex-wrap gap-x-4 gap-y-1 text-xs not-italic leading-relaxed text-background/70 lg:justify-end">
            <span>3204 NE 120th Cir, Salmon Creek, WA 98686</span>
            <a className="hover:text-background" href="mailto:jafar@jlinfluence.com">
              jafar@jlinfluence.com
            </a>
            <a className="hover:text-background" href="tel:+15034323034">
              (503) 432-3034
            </a>
          </address>
          <nav aria-label="Help" className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Link className={helpButton} href="/faq">
              <CircleHelp className="size-4" aria-hidden="true" /> FAQ
            </Link>
            {isStudioRoute && (
              <button
                type="button"
                className={`fs-onboarding-trigger ${helpButton} text-primary`}
                onClick={() => window.dispatchEvent(new Event("fs:open-onboarding"))}
              >
                <RotateCcw className="size-4" aria-hidden="true" /> Replay onboarding
              </button>
            )}
            <PwaControls />
          </nav>
        </div>
      </div>
    </footer>
  );
}
