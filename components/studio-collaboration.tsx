'use client'

import { useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  Clipboard,
  Focus,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  Send,
  Sparkles,
  Users,
  Video,
  WandSparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StudioLiveRoom } from '@/components/studio-live-room'

type LegacyReference = {
  id: string
  title: string
  url: string
  image_url: string | null
  note: string
  source: 'pinterest' | 'other'
  author_id: string
  created_at: string
}

export type SharedFile = {
  id: string
  title: string
  url: string
  provider: 'proton_drive' | 'other'
  context_note: string
  tags: string[]
  permission_scope: 'workspace' | 'restricted'
  added_by: string
  created_at: string
}

export type WorkRoom = {
  id: string
  title: string
  work_mode: 'deep_focus' | 'co_creation' | 'social_restoration'
  etiquette: string
  calendar_intent: string
  starts_at: string | null
  ends_at: string | null
  meeting_url: string | null
  created_by: string
  created_at: string
}

type Member = { user_id: string; role: string; display_name: string }
type Props = {
  workspaceId: string
  userId: string
  files: SharedFile[]
  rooms: WorkRoom[]
  references: LegacyReference[]
  members: Member[]
  onSaved: () => void
  notify: (message: string) => void
  view: 'library' | 'cameras' | 'guide'
}

let collaborationClient: ReturnType<typeof createClient> | null = null

function getSupabase() {
  collaborationClient ??= createClient()
  return collaborationClient
}

const referenceTags = ['Inspiration', 'Silhouette', 'Materials', 'Color', 'Product', 'Dev handoff']
const roomModes: { value: WorkRoom['work_mode']; label: string; detail: string }[] = [
  { value: 'deep_focus', label: 'Quiet focus', detail: 'Heads-down work, interruptions kept low' },
  { value: 'co_creation', label: 'Make together', detail: 'Open discussion and shared decisions' },
  { value: 'social_restoration', label: 'Open clubhouse', detail: 'Casual check-in, questions welcome' },
]

function readableUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Shared link'
  }
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'FS'
}

function toCalendarTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function roomCalendarHref(room: WorkRoom) {
  if (!room.starts_at) return undefined
  const start = new Date(room.starts_at)
  const end = room.ends_at ? new Date(room.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
  const description = [room.calendar_intent, room.etiquette, room.meeting_url].filter(Boolean).join('\n')
  const escapeIcsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const contents = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fairway Studio//Co-work//EN',
    'BEGIN:VEVENT', `UID:${room.id}@fairway-studio`, `DTSTAMP:${toCalendarTimestamp(new Date().toISOString())}`,
    `DTSTART:${toCalendarTimestamp(start.toISOString())}`, `DTEND:${toCalendarTimestamp(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(room.title)}`, `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(contents)}`
}

export function StudioCollaboration({ workspaceId, userId, files, rooms, references, members, onSaved, notify, view }: Props) {
  const supabase = getSupabase()
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkNote, setLinkNote] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>(['Inspiration'])
  const [roomTitle, setRoomTitle] = useState('')
  const [roomMode, setRoomMode] = useState<WorkRoom['work_mode']>('co_creation')
  const [roomStart, setRoomStart] = useState('')
  const [roomUrl, setRoomUrl] = useState('')
  const [roomEtiquette, setRoomEtiquette] = useState('Cameras optional; make space for every voice.')
  const [roomIntent, setRoomIntent] = useState('Flexible collaboration')
  const [liveRoom, setLiveRoom] = useState<WorkRoom | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [savingLink, setSavingLink] = useState(false)
  const [savingRoom, setSavingRoom] = useState(false)
  const [asking, setAsking] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const [addingStarterBoards, setAddingStarterBoards] = useState(false)

  const allLinks = [
    ...files.map((file) => {
      const media = file.url.startsWith('supabase-storage://workspace-media/') || file.url.startsWith('blob://workspace-assets/')
      return {
        id: file.id,
        title: file.title,
        url: media ? `/api/studio/media?id=${encodeURIComponent(file.id)}` : file.url,
        imageUrl: media ? `/api/studio/media?id=${encodeURIComponent(file.id)}` : null,
        note: file.context_note,
        tags: file.tags ?? [],
        authorId: file.added_by,
        createdAt: file.created_at,
        scope: file.permission_scope,
        media,
        legacy: false,
      }
    }),
    ...references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      url: reference.url,
      imageUrl: reference.image_url,
      note: reference.note,
      tags: reference.source === 'pinterest' ? ['Pinterest'] : ['Earlier reference'],
      authorId: reference.author_id,
      createdAt: reference.created_at,
      scope: 'workspace' as const,
      media: Boolean(reference.image_url),
      legacy: true,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const mediaLinks = allLinks.filter((link) => link.media && link.imageUrl)
  const linkItems = allLinks.filter((link) => !link.media)
  const activeRooms = [...rooms].sort((a, b) => {
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY
    const now = Date.now()
    const aPast = aTime < now
    const bPast = bTime < now
    if (aPast !== bPast) return Number(aPast) - Number(bPast)
    return aPast ? bTime - aTime : aTime - bTime
  })

  function setFormError(message: string) {
    setError(message)
    if (message) window.setTimeout(() => setError(''), 4000)
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      notify('Reference link copied.')
    } catch {
      setFormError('Clipboard access is unavailable in this browser.')
    }
  }

  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let safeUrl: URL
    try {
      safeUrl = new URL(linkUrl.trim())
      if (safeUrl.protocol !== 'https:') throw new Error('Use a secure https link.')
    } catch {
      setFormError('Add a valid secure https link so everyone can open it safely.')
      return
    }

    const title = (linkTitle.trim() || readableUrl(safeUrl.toString())).slice(0, 160)
    setSavingLink(true)
    setError('')
    const { error: saveError } = await supabase.from('workspace_files').insert({
      workspace_id: workspaceId,
      added_by: userId,
      title,
      url: safeUrl.toString(),
      provider: safeUrl.hostname.endsWith('drive.proton.me') ? 'proton_drive' : 'other',
      context_note: linkNote.trim(),
      tags: selectedTags,
      permission_scope: 'workspace',
    })
    setSavingLink(false)
    if (saveError) {
      setFormError('That link could not be shared. Check the URL and try again.')
      return
    }
    setLinkUrl('')
    setLinkTitle('')
    setLinkNote('')
    setSelectedTags(['Inspiration'])
    onSaved()
    notify('Link shared with your workspace.')
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('studio-media-files') as HTMLInputElement | null
    if (!input) return
    const selectedFiles = Array.from(input.files ?? [])
    if (!selectedFiles.length) return

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
    const maxFileSize = 10 * 1024 * 1024
    const maxFiles = 20
    const rejectedFiles = selectedFiles.filter((file) => !allowedTypes.has(file.type) || file.size > maxFileSize)
    const acceptedFiles = selectedFiles.filter((file) => allowedTypes.has(file.type) && file.size <= maxFileSize).slice(0, maxFiles)
    if (!acceptedFiles.length) {
      setFormError('Choose up to 20 JPG, PNG, WebP, AVIF, or GIF images under 10 MB each.')
      return
    }
    if (selectedFiles.length > maxFiles || rejectedFiles.length) {
      setFormError(`Some files were skipped. Upload up to 20 supported images, each under 10 MB.`)
    }

    setError('')
    setUploadProgress({ completed: 0, total: acceptedFiles.length })
    input.value = ''
    let completed = 0
    let uploadedCount = 0
    let failedCount = 0
    const queue = [...acceptedFiles]

    const worker = async () => {
      while (queue.length) {
        const file = queue.shift()
        if (!file) continue
        const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]
        const safeName = file.name
          .replace(/\.[^.]+$/, '')
          .normalize('NFKD')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'image'
        const path = `${workspaceId}/${userId}/${crypto.randomUUID()}-${safeName}.${extension}`
        try {
          const { error: uploadError } = await createClient()
            .storage.from('workspace-media')
            .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
          if (uploadError) throw uploadError
          const saveResponse = await fetch('/api/studio/media', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              path,
              title: file.name.slice(0, 160),
              tags: selectedTags,
            }),
          })
          if (!saveResponse.ok) {
            await fetch('/api/studio/media', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId, path }),
            })
            throw new Error('Could not save this image to the workspace library.')
          }
          uploadedCount += 1
        } catch {
          failedCount += 1
        } finally {
          completed += 1
          setUploadProgress({ completed, total: acceptedFiles.length })
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, acceptedFiles.length) }, worker))
    setUploadProgress(null)
    if (uploadedCount) {
      onSaved()
      notify(`${uploadedCount} ${uploadedCount === 1 ? 'image' : 'images'} added to the shared library.`)
    }
    if (failedCount) setFormError(`${failedCount} ${failedCount === 1 ? 'image' : 'images'} could not be uploaded. You can retry them.`)
  }

  async function addStarterBoards() {
    const starters = [
      { src: '/studio-editorial.png', title: 'Founding team working session', tags: ['Inspiration', 'Team'] },
      { src: '/moodboard-detail.png', title: 'Golf essentials — materials and styling', tags: ['Materials', 'Product'] },
    ]
    const missing = starters.filter((starter) => !allLinks.some((link) => link.title === starter.title))
    if (!missing.length) {
      notify('The starter boards are already in this workspace.')
      return
    }

    setAddingStarterBoards(true)
    setError('')
    let added = 0
    let failed = 0

    for (const starter of missing) {
      let path = ''
      let stored = false
      try {
        const imageResponse = await fetch(starter.src)
        if (!imageResponse.ok) throw new Error('Starter image unavailable')
        const image = await imageResponse.blob()
        const file = new File([image], `${starter.title}.png`, { type: 'image/png' })
        const safeName = starter.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        path = `${workspaceId}/${userId}/${crypto.randomUUID()}-${safeName}.png`
        const { error: uploadError } = await supabase.storage.from('workspace-media').upload(path, file, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadError) throw uploadError
        stored = true

        const saveResponse = await fetch('/api/studio/media', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, path, title: starter.title, tags: starter.tags }),
        })
        if (!saveResponse.ok) throw new Error('Could not save this starter board to the workspace library.')
        added += 1
      } catch {
        if (stored) {
          await fetch('/api/studio/media', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, path }),
          }).catch(() => undefined)
        }
        failed += 1
      }
    }

    setAddingStarterBoards(false)
    if (added) {
      onSaved()
      notify(`${added} studio starter ${added === 1 ? 'image was' : 'images were'} added to the shared library.`)
    }
    if (failed) setFormError(`${failed} starter ${failed === 1 ? 'image could' : 'images could'} not be added. Try again or upload your own references.`)
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let meetingUrl: string | null = null
    if (roomUrl.trim()) {
      try {
        const parsedUrl = new URL(roomUrl.trim())
        if (parsedUrl.protocol !== 'https:') throw new Error('HTTPS required')
        meetingUrl = parsedUrl.toString()
      } catch {
        setFormError('Meeting links need to start with https://')
        return
      }
    }

    const startsAt = roomStart ? new Date(roomStart) : null
    const endsAt = startsAt ? new Date(startsAt.getTime() + 60 * 60 * 1000) : null
    setSavingRoom(true)
    setError('')
    const { data: createdRoom, error: roomError } = await supabase.from('workspace_rooms').insert({
      workspace_id: workspaceId,
      created_by: userId,
      title: roomTitle.trim(),
      work_mode: roomMode,
      etiquette: roomEtiquette.trim(),
      calendar_intent: roomIntent.trim(),
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      meeting_url: meetingUrl,
    }).select('id').single()
    setSavingRoom(false)
    if (roomError || !createdRoom) {
      setFormError('The room could not be created. Check the details and try again.')
      return
    }
    const room: WorkRoom = {
      id: createdRoom.id,
      title: roomTitle.trim(),
      work_mode: roomMode,
      etiquette: roomEtiquette.trim(),
      calendar_intent: roomIntent.trim(),
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      meeting_url: meetingUrl,
      created_by: userId,
      created_at: new Date().toISOString(),
    }
    setRoomTitle('')
    setRoomStart('')
    setRoomUrl('')
    setLiveRoom(room)
    onSaved()
    notify('Room created. Your camera is ready to join.')
  }

  async function askGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    setAsking(true)
    setError('')
    setAnswer('')
    try {
      const response = await fetch('/api/studio/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, question: trimmed }),
      })
      const payload = await response.json() as { answer?: string; error?: string }
      if (!response.ok) throw new Error(payload.error || 'The Studio guide is unavailable right now.')
      setAnswer(payload.answer ?? '')
      setQuestion('')
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'The Studio guide is unavailable right now.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

      {view === 'cameras' && (liveRoom ? (
        <StudioLiveRoom
          workspaceId={workspaceId}
          room={liveRoom}
          userId={userId}
          displayName={members.find((member) => member.user_id === userId)?.display_name ?? 'Studio teammate'}
          onLeave={() => setLiveRoom(null)}
        />
      ) : (
        <section aria-labelledby="rooms-heading" className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center gap-2"><Video className="size-4 text-primary" /><h3 id="rooms-heading" className="font-semibold">Open a camera room</h3></div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Create a shared room and join with live camera, microphone, and teammate presence. External meeting links remain optional.</p>

          <form onSubmit={createRoom} className="mt-4 flex flex-col gap-3 border-b border-border pb-5">
            <label className="sr-only" htmlFor="room-title">Room name</label>
            <input id="room-title" required minLength={2} maxLength={100} value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="e.g. Collection direction, together" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Room style
                <select value={roomMode} onChange={(event) => setRoomMode(event.target.value as WorkRoom['work_mode'])} className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {roomModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Start time · optional
                <input aria-label="Room start time" type="datetime-local" value={roomStart} onChange={(event) => setRoomStart(event.target.value)} className="h-10 min-w-0 rounded-xl border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
            </div>
            <label className="sr-only" htmlFor="room-intent">Room intention</label>
            <input id="room-intent" required minLength={2} maxLength={180} value={roomIntent} onChange={(event) => setRoomIntent(event.target.value)} placeholder="What do we want to leave with?" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <label className="sr-only" htmlFor="room-etiquette">Room etiquette</label>
            <input id="room-etiquette" required minLength={2} maxLength={180} value={roomEtiquette} onChange={(event) => setRoomEtiquette(event.target.value)} placeholder="Set a light room agreement" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <label className="sr-only" htmlFor="room-meeting-url">Video meeting link</label>
            <input id="room-meeting-url" type="url" value={roomUrl} onChange={(event) => setRoomUrl(event.target.value)} placeholder="https://… meeting link · optional" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button disabled={savingRoom} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {savingRoom ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Create room and start camera
            </button>
          </form>
          <div className="flex flex-col">
            {activeRooms.length ? activeRooms.map((room) => {
              const mode = roomModes.find((item) => item.value === room.work_mode)
              const calendarHref = roomCalendarHref(room)
              const host = members.find((member) => member.user_id === room.created_by)?.display_name ?? 'A teammate'
              return (
                <article key={room.id} className="border-b border-border py-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-medium">{room.title}</h4><span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">{mode?.label ?? 'Co-work'}</span></div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{room.calendar_intent}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{room.starts_at ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(room.starts_at)) : 'Time to be decided'} · hosted by {host}</p>
                    </div>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Focus className="size-4" /></span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{room.etiquette}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLiveRoom(room)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Start camera <Video className="size-3.5" /></button>
                    {room.meeting_url && <a href={room.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">Open meeting link <ArrowUpRight className="size-3.5" /></a>}
                    {calendarHref && <a href={calendarHref} download="fairway-studio-session.ics" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary"><CalendarDays className="size-3.5" />Add to calendar</a>}
                  </div>
                </article>
              )
            }) : <p className="py-5 text-center text-sm leading-relaxed text-muted-foreground">No rooms yet. Set an intention and make the first one.</p>}
          </div>
        </section>
      ))}

      {view === 'library' && (
        <section aria-labelledby="links-heading" className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center gap-2"><Bookmark className="size-4 text-primary" /><h3 id="links-heading" className="font-semibold">Shared references &amp; media</h3></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Bring visual ideas into one shelf, then add a link for anything that lives elsewhere.</p>
          {allLinks.length === 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Start with two studio-made golf concepts</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">A team work session and a product-detail moodboard—saved privately to this workspace so everyone can build on them.</p>
              </div>
              <button type="button" onClick={() => { void addStarterBoards() }} disabled={addingStarterBoards} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {addingStarterBoards ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}{addingStarterBoards ? 'Adding starter boards…' : 'Add starter boards'}
              </button>
            </div>
          )}
          {mediaLinks.length > 0 && (
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-medium">Visual references</h4>
                <span className="text-xs text-muted-foreground">{mediaLinks.length} images</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {mediaLinks.map((link) => (
                  <article key={link.id} className="overflow-hidden rounded-xl border border-border bg-background">
                    <a href={link.imageUrl ?? link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open image: ${link.title}`} className="block aspect-[4/3] overflow-hidden bg-secondary">
                      <img src={link.imageUrl ?? link.url} alt={link.title} loading="lazy" className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
                    </a>
                    <div className="p-3">
                      <h5 className="line-clamp-2 text-sm font-medium">{link.title}</h5>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{link.note || 'Shared golf brand exploration'}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={uploadMedia} className="mt-4 rounded-xl border border-dashed border-border bg-secondary/40 p-4">
            <label htmlFor="studio-media-files" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg px-3 py-4 text-center outline-none transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring">
              {uploadProgress ? <LoaderCircle className="size-5 animate-spin text-primary" /> : <ImagePlus className="size-5 text-primary" />}
              <span className="text-sm font-medium">{uploadProgress ? `Adding ${uploadProgress.completed} of ${uploadProgress.total} images` : 'Add images in a batch'}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">JPG, PNG, WebP, AVIF, or GIF · up to 20 files · 10 MB each</span>
            </label>
            <input id="studio-media-files" name="studio-media-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple disabled={Boolean(uploadProgress)} onChange={(event) => { if (event.target.files?.length) event.currentTarget.form?.requestSubmit() }} className="sr-only" />
            {uploadProgress && <progress aria-label="Image upload progress" value={uploadProgress.completed} max={uploadProgress.total} className="mt-2 h-1.5 w-full accent-primary" />}
          </form>
          <form onSubmit={saveLink} className="mt-4 flex flex-col gap-2.5">
            <label className="sr-only" htmlFor="share-link-url">Paste a link</label>
            <input id="share-link-url" required type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Paste a link from anywhere" className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <label className="sr-only" htmlFor="share-link-title">Name this reference</label>
            <input id="share-link-title" maxLength={160} value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Give it a name (or we’ll use the site)" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <label className="sr-only" htmlFor="share-link-note">Why are you sharing this?</label>
            <input id="share-link-note" maxLength={500} value={linkNote} onChange={(event) => setLinkNote(event.target.value)} placeholder="What should we notice? Optional context" className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">Add a little context</legend>
              <div className="flex flex-wrap gap-2">
                {referenceTags.map((tag) => {
                  const pressed = selectedTags.includes(tag)
                  return <button key={tag} type="button" aria-pressed={pressed} onClick={() => setSelectedTags((current) => pressed ? current.filter((item) => item !== tag) : [...current, tag])} className={`rounded-full border px-2.5 py-1.5 text-xs transition-colors ${pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{tag}</button>
                })}
              </div>
            </fieldset>
            <button disabled={savingLink} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary disabled:opacity-60">
              {savingLink ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Share link
            </button>
          </form>
          <div className="mt-4 flex flex-col">
            {linkItems.length ? linkItems.map((link) => {
              const author = members.find((member) => member.user_id === link.authorId)?.display_name ?? 'Studio teammate'
              return (
                <article key={`${link.legacy ? 'old' : 'file'}-${link.id}`} className="flex items-start gap-3 border-t border-border py-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Link2 className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-medium">{link.title}</h4>{link.scope === 'restricted' && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">Restricted</span>}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{link.note || (link.media ? 'Image shared with the workspace' : readableUrl(link.url))}</p>
                    {link.media && <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-lg border border-border bg-secondary" aria-label={`Open image: ${link.title}`}><img src={link.url} alt={link.title} loading="lazy" className="max-h-56 w-full object-contain" /></a>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">{link.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{tag}</span>)}<span className="text-[11px] text-muted-foreground">· {author}</span></div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{link.media ? 'Open image' : `Open from ${readableUrl(link.url)}`} <ArrowUpRight className="size-3" /></a>
                      {!link.media && <button type="button" onClick={() => { void copyLink(link.url) }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Clipboard className="size-3" />Copy link</button>}
                    </div>
                  </div>
                </article>
              )
            }) : !mediaLinks.length ? <div className="flex flex-col items-center justify-center border-t border-border px-3 py-6 text-center"><Link2 className="size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">One shelf, no matter where it came from.</p><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Add a product detail, a prototype, a pin, or a line of code.</p></div> : null}
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"><Check className="size-3.5 shrink-0" />Shared links are visible to members of this workspace.</p>
        </section>
      )}

      {view === 'guide' && (
      <section aria-labelledby="guide-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid lg:grid-cols-[0.75fr_1.25fr]">
          <div className="bg-primary p-5 text-primary-foreground md:p-7">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary-foreground/10"><WandSparkles className="size-4" /></div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/60">A thinking partner</p>
            <h3 id="guide-heading" className="mt-2 text-xl font-semibold tracking-tight">Meet the Studio guide.</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-primary-foreground/70">Bring a question or a half-formed idea. It can help the whole team make a next move from what you’ve already shared.</p>
          </div>
          <div className="flex flex-col justify-center p-5 md:p-7">
            <form onSubmit={askGuide} className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="studio-guide-question">Ask the Studio guide</label>
              <input id="studio-guide-question" required maxLength={1200} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should we make a decision on next?" className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <button disabled={asking || !question.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {asking ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}Ask the guide
              </button>
            </form>
            {asking && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-3.5" />Thinking with your shared studio context…</p>}
            {answer && <div className="mt-4 rounded-xl bg-secondary p-4"><p className="flex items-center gap-2 text-xs font-medium text-secondary-foreground"><Sparkles className="size-3.5" />A thought for the team</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer}</p></div>}
            {!answer && !asking && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Uses this workspace’s shared ideas, next moves, and links. It won’t see other workspaces.</p>}
          </div>
        </div>
      </section>
      )}
    </div>
  )
}

export default StudioCollaboration
