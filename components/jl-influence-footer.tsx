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
  const studioBase = pathname.startsWith("/demo")
    ? "/demo"
    : pathname.startsWith("/w/")
      ? pathname.split("/").slice(0, 3).join("/")
      : "";

  function replayOnboarding() {
    const request = new Event("fs:open-onboarding", { cancelable: true });
    window.dispatchEvent(request);
    if (request.defaultPrevented || !studioBase) return;
    try {
      window.sessionStorage.setItem("fs:replay-onboarding", "1");
    } catch {}
    window.location.assign(`${studioBase}/projects`);
  }

  return (
    <footer
      data-studio={isStudioRoute ? (pathname.startsWith("/demo") ? "demo" : "") : undefined}
      className="fs-site-footer border-t border-border bg-[#f4f1eb] px-4 py-2.5 pb-24 text-foreground md:px-5 md:pb-2.5"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-x-5 gap-y-2 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(260px,1fr)_auto]">
        <a href="/" aria-label="Fairway Studio by JL Influence" className="inline-flex w-fit max-w-full items-center">
          <span className="relative block h-11 w-[180px] max-w-full overflow-hidden rounded-lg bg-[#171717] shadow-sm">
            <img
              src="/brand/jl-footer-banner.png"
              alt="JL Influence — Fairway Studio"
              width={425}
              height={154}
              className="absolute inset-x-0 -top-1 h-auto w-full"
            />
          </span>
        </a>
        <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
          <address className="flex flex-wrap gap-x-4 gap-y-0.5 not-italic">
            <span>3204 NE 120th Cir, Salmon Creek, WA 98686</span>
            <a className="hover:text-foreground" href="mailto:jafar@jlinfluence.com">
              jafar@jlinfluence.com
            </a>
            <a className="hover:text-foreground" href="tel:+15034323034">
              (503) 432-3034
            </a>
          </address>
          <p className="mt-0.5">© 2010 JL Influence · All rights reserved</p>
        </div>
        <nav aria-label="Help and installation" className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 md:justify-end xl:col-span-1 xl:col-start-3 xl:row-start-1">
          <Link className={helpButton} href="/faq">
            <CircleHelp className="size-4" aria-hidden="true" /> FAQ
          </Link>
          {isStudioRoute && (
            <button
              type="button"
              className={`fs-onboarding-trigger ${helpButton} text-primary`}
              onClick={replayOnboarding}
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Replay onboarding
            </button>
          )}
          <PwaControls />
        </nav>
      </div>
    </footer>
  );
}


