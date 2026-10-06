'use client'

import { useEffect, useState, type FormEvent } from 'react'
import useSWR, { mutate as mutateSWR } from 'swr'
import {
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Flag,
  FolderKanban,
  House,
  Images,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Plus,
  Share2,
  Sparkles,
  Users,
  Video,
  WandSparkles,
  X,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { StudioAuth } from '@/components/studio-auth'
import { StudioCollaboration, type SharedFile, type WorkRoom } from '@/components/studio-collaboration'
import { StudioConversation, studioMessagesKey } from '@/components/studio-conversation'

type Workspace = { id: string; name: string; created_at: string }
type Idea = { id: string; title: string; body: string; category: string; status: 'exploring' | 'shortlist' | 'approved'; author_id: string; updated_at: string }
type StudioTask = { id: string; title: string; details: string; category: string; status: 'open' | 'in_progress' | 'done'; created_by: string; assigned_to: string | null; created_at: string }
type Reference = { id: string; title: string; url: string; image_url: string | null; note: string; source: 'pinterest' | 'other'; author_id: string; created_at: string } 
type Member = { user_id: string; role: string; display_name: string }
type WorkspaceData = { ideas: Idea[]; tasks: StudioTask[]; references: Reference[]; files: SharedFile[]; rooms: WorkRoom[]; members: Member[] }

let browserClient: ReturnType<typeof createClient> | null = null

function getSupabase() {
  browserClient ??= createClient()
  return browserClient
}

const taskSeeds = [
  { title: 'Bring the brand name shortlist together', details: 'Collect a few names from each founder and review them together.', category: 'Brand' },
  { title: 'Write down the design principles', details: 'Describe what the clothes should feel like, where they belong, and what sets them apart.', category: 'Direction' },
  { title: 'Compare LLC setup options', details: 'List questions for a qualified business professional before choosing a structure.', category: 'Foundation' },
  { title: 'Build a first factory partner list', details: 'Start a shared list of manufacturers and production questions.', category: 'Production' },
]
const studioTools = [
  { label: 'Proton Mail', detail: 'Team email', url: 'https://mail.proton.me', icon: Mail },
  { label: 'Proton Calendar', detail: 'Plan together', url: 'https://calendar.proton.me', icon: Clock3 },
  { label: 'Proton Drive', detail: 'Shared files', url: 'https://drive.proton.me', icon: FolderKanban },
  { label: 'Proton Meet', detail: 'Video rooms', url: 'https://meet.proton.me', icon: Users },
  { label: 'Pinterest', detail: 'Visual research', url: 'https://www.pinterest.com', icon: Bookmark },
]

async function fetchUser() {
  const { data, error } = await getSupabase().auth.getUser()
  if (error && error.name !== 'AuthSessionMissingError') throw error
  return data.user ?? null
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await getSupabase().from('workspaces').select('id,name,created_at').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Workspace[]
}

async function fetchWorkspaceData(workspaceId: string): Promise<WorkspaceData> {
  const [ideasResult, tasksResult, referencesResult, filesResult, roomsResult, membersResult] = await Promise.all([
    getSupabase().from('brand_ideas').select('id,title,body,category,status,author_id,updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }),
    getSupabase().from('studio_tasks').select('id,title,details,category,status,created_by,assigned_to,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
    getSupabase().from('saved_references').select('id,title,url,image_url,note,source,author_id,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    getSupabase().from('workspace_files').select('id,title,url,provider,context_note,tags,permission_scope,added_by,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    getSupabase().from('workspace_rooms').select('id,title,work_mode,etiquette,calendar_intent,starts_at,ends_at,meeting_url,created_by,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    getSupabase().from('workspace_members').select('workspace_id,user_id,role').eq('workspace_id', workspaceId),
  ])
  const queryError = ideasResult.error ?? tasksResult.error ?? referencesResult.error ?? filesResult.error ?? roomsResult.error ?? membersResult.error
  if (queryError) throw queryError

  const memberRows = membersResult.data ?? []
  const memberIds = memberRows.map((member) => member.user_id)
  const profilesResult = memberIds.length
    ? await getSupabase().from('profiles').select('id,display_name').in('id', memberIds)
    : { data: [], error: null }
  if (profilesResult.error) throw profilesResult.error
  const profileNames = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]))

  return {
    ideas: (ideasResult.data ?? []) as Idea[],
    tasks: (tasksResult.data ?? []) as StudioTask[],
    references: (referencesResult.data ?? []) as Reference[],
    files: (filesResult.data ?? []) as SharedFile[],
    rooms: (roomsResult.data ?? []) as WorkRoom[],
    members: memberRows.map((member) => ({
      user_id: member.user_id,
      role: member.role,
      display_name: profileNames.get(member.user_id) || 'Studio member',
    })),
  }
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'FS'
}

function displayError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message).toLowerCase()
    if (message.includes('invalid') || message.includes('expired')) return 'This invitation may be invalid or expired.'
  }
  return 'That didn’t save. Check your connection and try again.'
}

type View = 'overview' | 'cameras' | 'conversation' | 'library' | 'ideas' | 'moves' | 'guide'
const views: { id: View; label: string; short: string; icon: typeof Sparkles }[] = [
  { id: 'overview', label: 'Studio overview', short: 'Home', icon: House },
  { id: 'cameras', label: 'Cameras', short: 'Cameras', icon: Video },
  { id: 'conversation', label: 'Conversation', short: 'Chat', icon: MessageCircle },
  { id: 'library', label: 'Content library', short: 'Library', icon: Images },
  { id: 'ideas', label: 'Brand ideas', short: 'Ideas', icon: Lightbulb },
  { id: 'moves', label: 'Next moves', short: 'Moves', icon: FolderKanban },
  { id: 'guide', label: 'Studio guide', short: 'Guide', icon: WandSparkles },
]
const mobileTabs = views.filter((item) => item.id !== 'guide')

function readView(): View {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.slice(1)
  return views.some((item) => item.id === hash) ? (hash as View) : 'overview'
}

function isMediaFile(file: SharedFile) {
  return file.url.startsWith('supabase-storage://workspace-media/') || file.url.startsWith('blob://workspace-assets/')
}

function isRoomActive(room: WorkRoom) {
  return !room.ends_at || new Date(room.ends_at).getTime() > Date.now()
}

function Sidebar({ workspace, members, view, onNavigate, onClose, onSignOut }: { workspace?: Workspace; members: Member[]; view: View; onNavigate: (view: View) => void; onClose?: () => void; onSignOut: () => void }) {
  return (
    <aside className="flex h-full flex-col overflow-y-auto bg-primary px-5 py-6 text-primary-foreground">
      <div className="flex items-center justify-between">
        <a href="#overview" onClick={() => { onNavigate('overview'); onClose?.() }} className="flex items-center gap-3" aria-label="Fairway Studio home">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/10"><Flag className="size-5" aria-hidden="true" /></span>
          <span><span className="block text-sm font-semibold tracking-wide">FAIRWAY STUDIO</span><span className="mt-0.5 block text-xs text-primary-foreground/60">Independent golf label</span></span>
        </a>
        {onClose && <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-2 hover:bg-primary-foreground/10"><X className="size-5" /></button>}
      </div>
      <p className="mt-10 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/50">Workspace</p>
      <nav aria-label="Workspace navigation" className="mt-3 flex flex-col gap-1">
        {views.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} onClick={() => { onNavigate(id); onClose?.() }} aria-current={view === id ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${view === id ? 'bg-primary-foreground/12 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/8 hover:text-primary-foreground'}`}><Icon className="size-[18px]" aria-hidden="true" />{label}</a>)}
      </nav>
      <div className="mt-9 rounded-2xl border border-primary-foreground/12 bg-primary-foreground/6 p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80"><Users className="size-4" /> Your founding team</div>
        <div className="mt-3 flex items-center gap-3"><div className="flex items-center">{members.slice(0, 4).map((member, index) => <span key={member.user_id} title={member.display_name} className={`flex size-9 items-center justify-center rounded-full border-2 border-primary text-[10px] font-semibold ${index === 0 ? 'bg-accent text-accent-foreground' : 'bg-primary-foreground/15 text-primary-foreground'} ${index ? '-ml-2' : ''}`}>{initials(member.display_name)}</span>)}</div><span className="text-xs leading-relaxed text-primary-foreground/60">{members.length} collaborator{members.length === 1 ? '' : 's'}<br />in this workspace</span></div>
      </div>
      <div className="mt-auto rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-4">
        <p className="truncate text-xs font-medium text-primary-foreground">{workspace?.name ?? 'Your workspace'}</p>
        <p className="mt-1 text-xs text-primary-foreground/55">Shared with your team</p>
      </div>
      <button onClick={onSignOut} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"><LogOut className="size-4" />Sign out</button>
    </aside>
  )
}

function AuthenticatedStudio({ user }: { user: User }) {
  const { data: workspaces, error: workspaceError, isLoading: workspacesLoading, mutate: mutateWorkspaces } = useSWR(
    `studio-workspaces:${user.id}`,
    fetchWorkspaces,
    { revalidateOnFocus: true },
  )
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const workspace = workspaces?.find((item) => item.id === selectedWorkspaceId) ?? workspaces?.[0]
  const workspaceId = workspace?.id
  const { data, error: dataError, isLoading: dataLoading, mutate: mutateData } = useSWR(
    workspaceId ? `studio-data:${workspaceId}` : null,
    () => fetchWorkspaceData(workspaceId!),
    { revalidateOnFocus: true },
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<View>(readView)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const syncView = () => { setView(readView()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', syncView)
    return () => window.removeEventListener('hashchange', syncView)
  }, [])

  function navigate(next: View) {
    setView(next)
    window.scrollTo({ top: 0 })
  }
  const [actionError, setActionError] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Golf, first')
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaBody, setIdeaBody] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    const channel = getSupabase().channel(`studio:${workspaceId}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_ideas', filter: `workspace_id=eq.${workspaceId}` }, () => { void mutateData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'studio_tasks', filter: `workspace_id=eq.${workspaceId}` }, () => { void mutateData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_files', filter: `workspace_id=eq.${workspaceId}` }, () => { void mutateData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_rooms', filter: `workspace_id=eq.${workspaceId}` }, () => { void mutateData() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_messages', filter: `workspace_id=eq.${workspaceId}` }, () => { void mutateSWR(studioMessagesKey(workspaceId)) })
      .subscribe()
    return () => { void getSupabase().removeChannel(channel) }
  }, [workspaceId, mutateData])

  function notify(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = workspaceName.trim()
    if (!name) return
    setCreatingWorkspace(true)
    setActionError('')
    const { data: createdId, error } = await getSupabase().rpc('create_workspace_with_owner', { p_name: name })
    if (error || !createdId) {
      setActionError(error ? displayError(error) : 'We couldn’t create the workspace. Try again in a moment.')
      setCreatingWorkspace(false)
      return
    }
    const starterTasks = taskSeeds.map((task) => ({ ...task, workspace_id: createdId, created_by: user.id }))
    const { error: taskError } = await getSupabase().from('studio_tasks').insert(starterTasks)
    setCreatingWorkspace(false)
    if (taskError) setActionError('The workspace is ready. You can add your first tasks from the studio.')
    await mutateWorkspaces()
    setSelectedWorkspaceId(createdId)
    notify('Your shared workspace is ready.')
  }

  async function acceptInvite() {
    const token = new URLSearchParams(window.location.search).get('invite')
    if (!token) return
    setSaving(true)
    setActionError('')
    const { error } = await getSupabase().rpc('accept_workspace_invite', { p_token: token })
    setSaving(false)
    if (error) {
      setActionError(displayError(error))
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url)
    await mutateWorkspaces()
    notify('You joined the shared workspace.')
  }

  async function createInvite() {
    if (!workspaceId) return
    setSaving(true)
    setActionError('')
    const { data: token, error } = await getSupabase().rpc('create_workspace_invite', { p_workspace_id: workspaceId })
    setSaving(false)
    if (error || !token) {
      setActionError('We couldn’t create an invitation. Workspace admins can manage invites.')
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('invite', token)
    setInviteLink(url.toString())
    try {
      await navigator.clipboard.writeText(url.toString())
      notify('Invitation link copied. Send it to a teammate to join.')
    } catch {
      notify('Invitation link created. Copy it from the field below.')
    }
  }

  async function addIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceId || !ideaTitle.trim()) return
    setSaving(true)
    setActionError('')
    const { error } = await getSupabase().from('brand_ideas').insert({ workspace_id: workspaceId, author_id: user.id, title: ideaTitle.trim(), body: ideaBody.trim(), category: 'Brand' })
    setSaving(false)
    if (error) { setActionError('We couldn’t save that idea. Please try again.'); return }
    setIdeaTitle('')
    setIdeaBody('')
    await mutateData()
  }

  async function updateIdeaStatus(idea: Idea, status: Idea['status']) {
    const { error } = await getSupabase().from('brand_ideas').update({ status, updated_at: new Date().toISOString() }).eq('id', idea.id).eq('workspace_id', workspaceId!)
    if (error) { setActionError('We couldn’t update that idea. Please try again.'); return }
    await mutateData()
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspaceId || !taskTitle.trim()) return
    setSaving(true)
    setActionError('')
    const { error } = await getSupabase().from('studio_tasks').insert({ workspace_id: workspaceId, created_by: user.id, title: taskTitle.trim(), category: 'Brand' })
    setSaving(false)
    if (error) { setActionError('We couldn’t add that next move. Please try again.'); return }
    setTaskTitle('')
    await mutateData()
  }

  async function advanceTask(task: StudioTask) {
    const status: StudioTask['status'] = task.status === 'open' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'open'
    const { error } = await getSupabase().from('studio_tasks').update({ status }).eq('id', task.id).eq('workspace_id', workspaceId!)
    if (error) { setActionError('We couldn’t update that task. Please try again.'); return }
    await mutateData()
  }


  async function signOut() {
    await getSupabase().auth.signOut()
  }

  if (workspacesLoading) return <LoadingScreen label="Opening your workspace" />
  if (workspaceError) return <LoadingScreen label="We couldn’t load your workspaces. Refresh to try again." />
  if (!workspaces?.length) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
        <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 shadow-sm md:p-9">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Flag className="size-5" /></span>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Build together</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your team workspace.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Start a new studio or accept a teammate’s invitation to join their workspace.</p>
          {new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).has('invite') && <button onClick={acceptInvite} disabled={saving} className="mt-5 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-secondary">Accept team invitation</button>}
          <form onSubmit={createWorkspace} className="mt-5 flex flex-col gap-3">
            <label htmlFor="workspace-name" className="text-sm font-medium">Workspace name</label>
            <input id="workspace-name" required maxLength={120} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            {actionError && <p role="alert" className="text-sm leading-relaxed text-destructive">{actionError}</p>}
            <button disabled={creatingWorkspace} className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{creatingWorkspace && <LoaderCircle className="size-4 animate-spin" />}Create workspace</button>
          </form>
          <button onClick={signOut} className="mt-5 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Sign out</button>
        </section>
      </main>
    )
  }

  const ideas = data?.ideas ?? []
  const tasks = data?.tasks ?? []
  const references = data?.references ?? []
  const files = data?.files ?? []
  const rooms = data?.rooms ?? []
  const members = data?.members ?? []
  const openTasks = tasks.filter((task) => task.status !== 'done').length
  const activeRooms = rooms.filter(isRoomActive)
  const nextRoom = activeRooms.find((room) => room.starts_at) ?? activeRooms[0]
  const mediaPreview = files.filter(isMediaFile).slice(0, 3)
  const invitationPending = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).has('invite')

  return (
    <div className="min-h-screen bg-background md:flex">
      <div className="hidden w-[264px] shrink-0 md:block"><div className="sticky top-0 h-screen"><Sidebar workspace={workspace} members={members} view={view} onNavigate={navigate} onSignOut={signOut} /></div></div>
      {menuOpen && <div className="fixed inset-0 z-40 md:hidden"><button className="absolute inset-0 bg-foreground/45" aria-label="Close menu overlay" onClick={() => setMenuOpen(false)} /><div className="relative h-full w-[min(85vw,320px)]"><Sidebar workspace={workspace} members={members} view={view} onNavigate={navigate} onClose={() => setMenuOpen(false)} onSignOut={signOut} /></div></div>}
      <main className="min-w-0 flex-1 pb-24 md:pb-0">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded-lg border border-border p-2 text-foreground md:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu className="size-5" /></button>
            <div className="hidden items-center gap-2 text-sm sm:flex"><span className="text-muted-foreground">Workspace</span><span className="text-muted-foreground/60">/</span><select aria-label="Choose workspace" value={workspace?.id ?? ''} onChange={(event) => setSelectedWorkspaceId(event.target.value)} className="max-w-[220px] truncate bg-transparent font-medium outline-none">{workspaces?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <span className="max-w-[130px] truncate rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground sm:hidden">{workspace?.name.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground lg:block">{user.email}</span>
            <button onClick={createInvite} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:px-4"><Share2 className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Invite teammate</span><span className="sm:hidden">Invite</span></button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-7 md:gap-10 md:px-8 md:py-9">
          {(invitationPending || inviteLink) && <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{invitationPending ? 'A teammate invited you to collaborate.' : 'Workspace invitation link'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{invitationPending ? 'Accept the invitation to join their shared brand workspace.' : 'Anyone with this link can join as a workspace editor.'}</p></div>{invitationPending ? <button disabled={saving} onClick={acceptInvite} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Accept invitation</button> : <input aria-label="Invitation link" readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} className="min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-xs sm:max-w-sm" />}</div>}
          {actionError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{actionError}</p>}
          {dataError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">Studio details couldn’t be loaded. Refresh to try again.</p>}
          {view === 'overview' && (<>
          <section aria-labelledby="welcome-heading" className="grid overflow-hidden rounded-[1.75rem] bg-card shadow-sm ring-1 ring-border lg:grid-cols-[1fr_0.9fr]">
            <div className="flex flex-col justify-center p-6 md:p-10 lg:p-12">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><span className="size-2 rounded-full bg-primary" /> Founding workspace</div>
              <h1 id="welcome-heading" className="mt-5 max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-foreground md:text-5xl">The next chapter<br className="hidden sm:block" /> starts on the course.</h1>
              <p className="mt-5 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">A shared space to build a golf label with a point of view—where the game, high fashion, and culture meet.</p>
              <div className="mt-7 flex flex-wrap items-center gap-3"><a href="#moves" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">See what&apos;s next <ArrowRight className="size-4" /></a><span className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground"><Users className="size-4" /> {members.map((member) => member.display_name).join(', ') || 'Your founding team'}</span></div>
            </div>
            <div className="relative min-h-[240px] overflow-hidden md:min-h-[340px] lg:min-h-[400px]"><img src="/studio-editorial.png" alt="Three collaborators sharing ideas around a table at a golf clubhouse" className="absolute inset-0 size-full object-cover object-center" /><div className="absolute inset-0 bg-gradient-to-t from-foreground/55 via-transparent to-transparent" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white md:p-7"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">The starting point</p><p className="mt-1 text-lg font-medium">Golf is the first chapter.</p></div><span className="rounded-full border border-white/35 bg-foreground/15 px-3 py-1.5 text-xs backdrop-blur">Chapter 01</span></div></div>
          </section>

          <section aria-label="Studio destinations" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <a href="#cameras" className="group col-span-2 flex min-h-48 flex-col justify-between gap-6 rounded-2xl bg-primary p-5 text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/10"><Video className="size-5" aria-hidden="true" /></span>
                <span className="rounded-full bg-primary-foreground/10 px-2.5 py-1 text-xs">{activeRooms.length} room{activeRooms.length === 1 ? '' : 's'} open</span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Cameras</h2>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-primary-foreground/70">{nextRoom ? `Next up: ${nextRoom.title}` : 'Open a room, set the intention, and work side by side on camera.'}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium">Go to Cameras <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </div>
            </a>
            <a href="#library" className="group col-span-2 flex min-h-48 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Images className="size-5" aria-hidden="true" /></span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{files.length + references.length} saved</span>
              </div>
              {mediaPreview.length > 0 && <div className="grid grid-cols-3 gap-2">{mediaPreview.map((file) => <img key={file.id} src={`/api/studio/media?id=${encodeURIComponent(file.id)}`} alt="" loading="lazy" className="aspect-square w-full rounded-lg bg-secondary object-cover" />)}</div>}
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Content library</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{mediaPreview.length ? 'Images and links the team has gathered.' : 'Bulk-import images and save links from anywhere.'}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">Open library <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </div>
            </a>
            <a href="#ideas" className="col-span-1 flex min-h-28 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring xl:col-span-2 md:p-5"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Lightbulb className="size-4" aria-hidden="true" />Brand ideas</span><span className="text-lg font-semibold tracking-tight">{ideas.length} saved</span></a>
            <a href="#moves" className="col-span-1 flex min-h-28 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring xl:col-span-2 md:p-5"><span className="flex items-center gap-2 text-xs text-muted-foreground"><FolderKanban className="size-4" aria-hidden="true" />Next moves</span><span className="text-lg font-semibold tracking-tight">{openTasks} open</span></a>
          </section>
          </>)}

          {view === 'ideas' && (
          <section id="brand-ideas" aria-labelledby="ideas-heading" className="scroll-mt-24">
            <SectionHeading eyebrow="An evolving point of view" title="Ideas we&apos;re shaping together" detail="Capture a thought while it is fresh. The team can grow it, shortlist it, or mark it as approved." />
            <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <form onSubmit={addIdea} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 md:p-6">
                <div className="flex items-center gap-2"><Plus className="size-4 text-primary" /><h3 className="font-semibold">Add a brand idea</h3></div>
                <label className="sr-only" htmlFor="idea-title">Idea title</label><input id="idea-title" required maxLength={160} value={ideaTitle} onChange={(event) => setIdeaTitle(event.target.value)} placeholder="A name, a feeling, a design rule…" className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <label className="sr-only" htmlFor="idea-body">More detail</label><textarea id="idea-body" maxLength={3000} value={ideaBody} onChange={(event) => setIdeaBody(event.target.value)} placeholder="Add context so the team can build on it." rows={4} className="resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <button disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving && <LoaderCircle className="size-4 animate-spin" />}Save idea</button>
              </form>
              <div className="flex flex-col gap-3">
                {dataLoading ? <LoadingInline /> : ideas.length ? ideas.map((idea) => <article key={idea.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Lightbulb className="size-4" /></span><div><h3 className="font-medium leading-relaxed">{idea.title}</h3><p className="mt-1 text-xs text-muted-foreground">{idea.category} · Added by {members.find((member) => member.user_id === idea.author_id)?.display_name ?? 'a teammate'}</p></div></div><select aria-label={`Idea status for ${idea.title}`} value={idea.status} onChange={(event) => void updateIdeaStatus(idea, event.target.value as Idea['status'])} className="rounded-full border border-border bg-background px-2.5 py-1.5 text-xs capitalize text-foreground"><option value="exploring">Exploring</option><option value="shortlist">Shortlist</option><option value="approved">Approved</option></select></div>{idea.body && <p className="mt-3 pl-12 text-sm leading-relaxed text-muted-foreground">{idea.body}</p>}</article>) : <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center"><Lightbulb className="size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">The first idea is yours to add.</p><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Names, materials, silhouettes, principles—save the thought and let the team build from it.</p></div>}
              </div>
            </div>
          </section>
          )}

          {view === 'moves' && (
          <section id="next-moves" aria-labelledby="next-heading" className="scroll-mt-24 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Keep moving</p><h2 id="next-heading" className="mt-1.5 text-xl font-semibold tracking-tight">Next moves</h2></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{openTasks} open</span></div>
              <form onSubmit={addTask} className="mt-5 flex gap-2"><label className="sr-only" htmlFor="task-title">Add a next move</label><input id="task-title" required maxLength={240} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a next move for the team" className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><button aria-label="Save next move" disabled={saving} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-60"><Plus className="size-5" /></button></form>
              <div className="mt-3 flex flex-col">{dataLoading ? <LoadingInline /> : tasks.length ? tasks.map((task, index) => <div key={task.id} className={`flex items-center gap-3 py-4 ${index < tasks.length - 1 ? 'border-b border-border' : ''}`}><button aria-label={`${task.status === 'done' ? 'Reopen' : 'Advance'} ${task.title}`} onClick={() => void advanceTask(task)} className={`rounded-full p-1 ${task.status === 'done' ? 'text-primary' : 'text-muted-foreground/60 hover:text-primary'}`}>{task.status === 'done' ? <CheckCircle2 className="size-5" /> : task.status === 'in_progress' ? <Clock3 className="size-5" /> : <Circle className="size-5" />}</button><div className="min-w-0 flex-1"><p className={`text-sm font-medium leading-relaxed ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.category}{task.status === 'in_progress' ? ' · In progress' : task.status === 'done' ? ' · Done' : ''}</p></div></div>) : <p className="py-7 text-center text-sm text-muted-foreground">Add your team&apos;s first next move.</p>}</div>
              <p className="mt-2 flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"><Check className="size-4 shrink-0" /> Tap the circle to move a task forward. Updates sync for everyone.</p>
            </div>
            <div className="flex flex-col gap-4">
              <section aria-labelledby="tools-heading" className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center gap-2"><ExternalLink className="size-4 text-primary" /><h2 id="tools-heading" className="font-semibold">Your team tools</h2></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Quick links to the services your team already uses. They open in a new tab.</p><div className="mt-4 grid grid-cols-2 gap-2">{studioTools.map(({ label, detail, url, icon: Icon }) => <a key={label} href={url} target="_blank" rel="noreferrer" className="group rounded-xl border border-border p-3 transition-colors hover:bg-secondary"><span className="flex items-center justify-between"><Icon className="size-4 text-primary" /><ExternalLink className="size-3.5 text-muted-foreground group-hover:text-foreground" /></span><span className="mt-3 block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></a>)}</div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">These are launch links, not direct account connections.</p></section>
            </div>
          </section>
          )}

          {(view === 'cameras' || view === 'library') && <SectionHeading eyebrow={view === 'cameras' ? 'Face to face, from anywhere' : 'One shelf for the team'} title={view === 'cameras' ? 'Cameras' : 'Content library'} detail={view === 'cameras' ? 'Open a room with a clear intention, then join on video or add it to your calendar.' : 'Import a batch of images or save a link. Everything stays private to this workspace.'} />}
          {view === 'conversation' && <StudioConversation workspaceId={workspaceId!} userId={user.id} members={members} />}
          {(view === 'cameras' || view === 'library' || view === 'guide' || view === 'overview') && <StudioCollaboration key={view} view={view === 'overview' ? 'guide' : view} workspaceId={workspaceId!} userId={user.id} files={files} rooms={rooms} references={references} members={members} onSaved={() => mutateData()} notify={notify} />}

          {view === 'overview' && <section aria-label="Founding team" className="rounded-2xl bg-secondary p-5 md:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Three points of view</p><h2 className="mt-1 text-lg font-semibold">The people behind the label</h2></div><button onClick={createInvite} className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Users className="size-4" />Invite teammate</button></div><div className="mt-4 grid gap-3 md:grid-cols-3">{members.map((member) => <article key={member.user_id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">{initials(member.display_name)}</span><div><h3 className="text-sm font-semibold">{member.display_name}</h3><p className="text-xs capitalize text-muted-foreground">{member.role}</p></div></div></article>)}</div><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-card px-3 py-1.5">Jafar · Digital &amp; media</span><span className="rounded-full bg-card px-3 py-1.5">Arlin · Golf &amp; fashion</span><span className="rounded-full bg-card px-3 py-1.5">Kyle · Design &amp; references</span></div></section>}

        </div>
        <nav aria-label="Workspace" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <ul className="grid grid-cols-6">
            {mobileTabs.map(({ id, short, icon: Icon }) => (
              <li key={id}>
                <a href={`#${id}`} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${view === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Icon className="size-5" aria-hidden="true" />{short}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {notice && <div role="status" className="fixed bottom-24 left-1/2 md:bottom-5 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-xl"><Check className="size-4 shrink-0" />{notice}</div>}
      </main>
    </div>
  )
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{title}</h2></div><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{detail}</p></div>
}

function LoadingInline() {
  return <div className="flex items-center justify-center gap-2 py-7 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading shared studio…</div>
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="flex min-h-screen items-center justify-center gap-3 bg-background px-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{label}</main>
}

export function StudioWorkspace() {
  const { data: user, error, isLoading, mutate } = useSWR<User | null>('studio-user', fetchUser, { revalidateOnFocus: true })
  useEffect(() => {
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, session) => {
      void mutate(session?.user ?? null, { revalidate: false })
    })
    return () => subscription.unsubscribe()
  }, [mutate])

  if (isLoading) return <LoadingScreen label="Preparing your private studio" />
  if (error) return <LoadingScreen label="We couldn’t verify your session. Refresh to try again." />
  if (!user) return <StudioAuth invitePending={typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('invite')} />
  return <AuthenticatedStudio user={user} />
}

export default StudioWorkspace
