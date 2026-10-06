'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { LoaderCircle, MessageCircle, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type StudioMessage = {
  id: string
  author_id: string
  body: string
  created_at: string
}

type Member = { user_id: string; role: string; display_name: string }
type Props = { workspaceId: string; userId: string; members: Member[] }

let supabaseClient: ReturnType<typeof createClient> | null = null

function getSupabase() {
  supabaseClient ??= createClient()
  return supabaseClient
}

export const studioMessagesKey = (workspaceId: string) => `studio-messages:${workspaceId}`

async function fetchMessages(workspaceId: string): Promise<StudioMessage[]> {
  const { data, error } = await getSupabase()
    .from('workspace_messages')
    .select('id,author_id,body,created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return ((data ?? []) as StudioMessage[]).reverse()
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function StudioConversation({ workspaceId, userId, members }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const { data: messages, error: loadError, isLoading, mutate } = useSWR(
    studioMessagesKey(workspaceId),
    () => fetchMessages(workspaceId),
    { revalidateOnFocus: true },
  )

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setSending(true)
    setError('')
    try {
      const { error: insertError } = await getSupabase().from('workspace_messages').insert({
        workspace_id: workspaceId,
        author_id: userId,
        body: trimmed,
      })
      if (insertError) throw insertError
      setBody('')
      await mutate()
    } catch {
      setError('Your message could not be sent. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-labelledby="conversation-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5 md:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace conversation</p>
          <h2 id="conversation-heading" className="mt-1 text-lg font-semibold">Talk it through</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">A shared, persistent thread for the decisions and details between calls.</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground"><MessageCircle className="size-3.5" aria-hidden="true" />Private to members</span>
      </div>

      <ol ref={listRef} aria-label="Workspace messages" aria-live="polite" aria-relevant="additions" className="flex max-h-[min(55vh,520px)] min-h-64 flex-col gap-4 overflow-y-auto p-5 md:p-6">
        {isLoading ? (
          <li role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading conversation…</li>
        ) : loadError ? (
          <li role="alert" className="flex flex-1 items-center justify-center text-center text-sm text-destructive">The conversation could not be loaded. Refresh and try again.</li>
        ) : messages?.length ? messages.map((message) => {
          const ownMessage = message.author_id === userId
          const authorName = members.find((member) => member.user_id === message.author_id)?.display_name ?? 'Studio teammate'
          return (
            <li key={message.id} className={`flex flex-col gap-1 ${ownMessage ? 'items-end' : 'items-start'}`}>
              <div className="flex max-w-[90%] items-baseline gap-2">
                <span className="text-xs font-medium text-foreground">{ownMessage ? 'You' : authorName}</span>
                <time dateTime={message.created_at} className="text-[11px] text-muted-foreground">{formatMessageTime(message.created_at)}</time>
              </div>
              <p className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${ownMessage ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-secondary text-secondary-foreground'}`}>{message.body}</p>
            </li>
          )
        }) : (
          <li className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><MessageCircle className="size-5" aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-medium">Start the conversation</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Share a thought, ask a question, or leave a note for the next time your team meets.</p>
          </li>
        )}
      </ol>

      <form onSubmit={sendMessage} className="border-t border-border bg-background/60 p-4 md:p-5">
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <label htmlFor="studio-message" className="sr-only">Write a workspace message</label>
        <div className="flex items-end gap-2">
          <textarea id="studio-message" required maxLength={4000} rows={2} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message to your team…" className="min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" disabled={sending || !body.trim()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
            {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Send</span><span className="sr-only sm:hidden">Send message</span>
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Messages are visible to workspace members and kept in this thread.</p>
      </form>
    </section>
  )
}

export default StudioConversation

