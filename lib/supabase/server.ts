import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (url && new URL(url).hostname !== 'xljhxmyigtxhjtxxzuwk.supabase.co') throw new Error('The configured database is not the approved Fairway project.')

  if (!url || !key) {
    throw new Error('Supabase server configuration is missing.')
  }

  return createServerClient(url, key, {
    cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Proxy refreshes cookies during Server Component renders.
        }
      },
    },
  })
}
