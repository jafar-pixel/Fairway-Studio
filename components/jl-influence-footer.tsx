"use client";

import Link from "next/link";
import { CircleHelp, RotateCcw } from "lucide-react";
import { usePathname } from "next/navigation";
import { PwaControls } from "@/components/studio/pwa-controls";

const helpButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function JLInfluenceFooter() {
  const pathname = usePathname();
  const isStudioRoute = pathname === "/demo" || pathname.startsWith("/demo/") || pathname.startsWith("/w/");

  return (
    <footer
      data-studio={isStudioRoute ? (pathname.startsWith("/demo") ? "demo" : "") : undefined}
      className="fs-site-footer border-t border-border bg-[#f4f1eb] px-4 py-3 pb-24 text-foreground md:px-6 md:pb-3"
    >
      <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)] lg:items-center">
        <a href="/" aria-label="Fairway Studio by JL Influence" className="inline-flex w-fit max-w-full items-center gap-3">
          <span className="relative block h-14 w-[220px] max-w-full overflow-hidden rounded-xl bg-[#171717] shadow-sm">
            <img
              src="/brand/jl-footer-banner.png"
              alt="JL Influence — Fairway Studio"
              width={425}
              height={154}
              className="absolute inset-x-0 -top-1 h-auto w-full"
            />
          </span>
          <span className="hidden text-[11px] leading-relaxed text-muted-foreground xl:block">
            © 2010 jlinfluence.com
            <br />All rights reserved
          </span>
        </a>
        <div className="flex flex-col gap-2 lg:items-end">
          <address className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] not-italic leading-relaxed text-muted-foreground lg:justify-end">
            <span>3204 NE 120th Cir, Salmon Creek, WA 98686</span>
            <a className="hover:text-foreground" href="mailto:jafar@jlinfluence.com">
              jafar@jlinfluence.com
            </a>
            <a className="hover:text-foreground" href="tel:+15034323034">
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

