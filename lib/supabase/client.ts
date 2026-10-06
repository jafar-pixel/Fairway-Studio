'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

export function createClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (url && new URL(url).hostname !== 'xljhxmyigtxhjtxxzuwk.supabase.co') throw new Error('The configured database is not the approved Fairway project.')

  if (!url || !key) {
    throw new Error('Supabase browser configuration is missing.')
  }

  browserClient = createBrowserClient(url, key, {
    cookieOptions: { secure: process.env.NODE_ENV === 'production' },
  })

  return browserClient
}

export type { User } from '@supabase/supabase-js'

