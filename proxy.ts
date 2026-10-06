import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|pwa/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
