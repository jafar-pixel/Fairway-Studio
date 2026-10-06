'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, MicOff, PhoneOff, Users, Video, VideoOff } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { WorkRoom } from '@/components/studio-collaboration'

type Props = {
  workspaceId: string
  room: WorkRoom
  userId: string
  displayName: string
  onLeave: () => void
}

type SignalPayload = {
  from: string
  to: string
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

type Participant = { id: string; displayName: string }
type RemoteStream = { displayName: string; stream: MediaStream }
type PresenceMeta = { userId?: string; displayName?: string }

function VideoTile({ stream, label, muted = false, cameraEnabled = true }: { stream: MediaStream | null; label: string; muted?: boolean; cameraEnabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="size-full object-cover" />
      {!cameraEnabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary text-secondary-foreground">
          <VideoOff className="size-6" aria-hidden="true" />
          <span className="text-sm font-medium">Camera off</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground">{label}{muted ? ' · You' : ''}</span>
    </div>
  )
}

export function StudioLiveRoom({ workspaceId, room, userId, displayName, onLeave }: Props) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, RemoteStream>>({})
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [error, setError] = useState('')
  const localStreamRef = useRef<MediaStream | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const localPeerIdRef = useRef('')
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>())
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>())
  const peerNamesRef = useRef(new Map<string, string>())

  function sendSignal(message: Omit<SignalPayload, 'from'>) {
    const channel = channelRef.current
    const from = localPeerIdRef.current
    if (!channel || !from) return
    void channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...message, from },
    }).then((status) => {
      if (status !== 'ok') setError('A connection signal could not be delivered. Leave and rejoin the room to try again.')
    })
  }

  function createPeerConnection(peerId: string) {
    const existing = peerConnectionsRef.current.get(peerId)
    if (existing) return existing

    const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    localStreamRef.current?.getTracks().forEach((track) => connection.addTrack(track, localStreamRef.current as MediaStream))
    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ to: peerId, candidate: event.candidate.toJSON() })
    }
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      setRemoteStreams((current) => ({
        ...current,
        [peerId]: { displayName: peerNamesRef.current.get(peerId) ?? 'Teammate', stream },
      }))
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        setError('This network blocked a direct video connection. A TURN relay is needed for calls on restricted networks.')
      }
    }
    peerConnectionsRef.current.set(peerId, connection)
    return connection
  }

  async function flushPendingCandidates(peerId: string, connection: RTCPeerConnection) {
    const candidates = pendingCandidatesRef.current.get(peerId) ?? []
    pendingCandidatesRef.current.delete(peerId)
    await Promise.all(candidates.map((candidate) => connection.addIceCandidate(candidate)))
  }

  async function handleSignal(payload: SignalPayload) {
    const localPeerId = localPeerIdRef.current
    if (!localPeerId || payload.to !== localPeerId || payload.from === localPeerId) return

    const connection = createPeerConnection(payload.from)
    if (payload.candidate) {
      if (connection.remoteDescription) {
        await connection.addIceCandidate(payload.candidate)
      } else {
        const pending = pendingCandidatesRef.current.get(payload.from) ?? []
        pending.push(payload.candidate)
        pendingCandidatesRef.current.set(payload.from, pending)
      }
      return
    }

    if (!payload.description) return
    await connection.setRemoteDescription(payload.description)
    await flushPendingCandidates(payload.from, connection)
    if (payload.description.type === 'offer') {
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      const localDescription = connection.localDescription
      if (localDescription) {
        sendSignal({ to: payload.from, description: { type: localDescription.type, sdp: localDescription.sdp } })
      }
    }
  }

  async function createOffer(peerId: string, connection: RTCPeerConnection) {
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    const localDescription = connection.localDescription
    if (localDescription) {
      sendSignal({ to: peerId, description: { type: localDescription.type, sdp: localDescription.sdp } })
    }
  }

  function syncParticipants(channel: RealtimeChannel) {
    const presence = channel.presenceState() as Record<string, PresenceMeta[]>
    const localPeerId = localPeerIdRef.current
    const active = Object.entries(presence)
      .filter(([peerId]) => peerId !== localPeerId)
      .map(([peerId, metas]) => ({ id: peerId, displayName: metas.at(-1)?.displayName || 'Studio teammate' }))

    peerNamesRef.current = new Map(active.map((participant) => [participant.id, participant.displayName]))
    setParticipants(active)
    const activeIds = new Set(active.map((participant) => participant.id))

    for (const [peerId, connection] of peerConnectionsRef.current) {
      if (!activeIds.has(peerId)) {
        connection.close()
        peerConnectionsRef.current.delete(peerId)
        pendingCandidatesRef.current.delete(peerId)
        setRemoteStreams((current) => {
          const next = { ...current }
          delete next[peerId]
          return next
        })
      }
    }

    for (const participant of active) {
      if (peerConnectionsRef.current.has(participant.id)) continue
      const connection = createPeerConnection(participant.id)
      if (localPeerId < participant.id) void createOffer(participant.id, connection).catch(() => setError('Could not start a connection with a teammate.'))
    }
  }

  async function startCall() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Open the studio in a current browser over HTTPS.')
      return
    }

    setError('')
    setIsStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      localStreamRef.current = stream
      setLocalStream(stream)
      localPeerIdRef.current = crypto.randomUUID()

      const channel = createClient().channel(`studio-room:${workspaceId}:${room.id}`, {
        config: { private: true, presence: { key: localPeerIdRef.current }, broadcast: { ack: true } },
      })
      channelRef.current = channel
      channel
        .on('broadcast', { event: 'signal' }, ({ payload }) => { void handleSignal(payload as SignalPayload).catch(() => setError('Could not complete the video connection. Leave and rejoin to retry.')) })
        .on('presence', { event: 'sync' }, () => syncParticipants(channel))

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            reject(new Error('Supabase could not authorize the private camera room. Confirm private Realtime channels are enabled for this project, then retry.'))
          }
        })
      })

      const presenceStatus = await channel.track({ userId, displayName, joinedAt: new Date().toISOString() })
      if (presenceStatus !== 'ok') throw new Error('Could not publish your presence in this room. Rejoin and try again.')
      setIsConnected(true)
    } catch (caught) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
      if (channelRef.current) await createClient().removeChannel(channelRef.current)
      channelRef.current = null
      setError(caught instanceof Error ? caught.message : 'Could not start the camera room.')
    } finally {
      setIsStarting(false)
    }
  }

  function leaveCall() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    peerConnectionsRef.current.forEach((connection) => connection.close())
    peerConnectionsRef.current.clear()
    pendingCandidatesRef.current.clear()
    peerNamesRef.current.clear()
    setRemoteStreams({})
    setParticipants([])
    setIsConnected(false)
    if (channelRef.current) void createClient().removeChannel(channelRef.current)
    channelRef.current = null
    onLeave()
  }

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    peerConnectionsRef.current.forEach((connection) => connection.close())
    if (channelRef.current) void createClient().removeChannel(channelRef.current)
  }, [])

  const tiles = Object.entries(remoteStreams)

  return (
    <section aria-labelledby="live-room-heading" className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live camera room</p>
          <h3 id="live-room-heading" className="mt-1 text-lg font-semibold">{room.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{room.calendar_intent}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground" aria-live="polite">
          <Users className="size-3.5" aria-hidden="true" />{participants.length + (isConnected ? 1 : 0)} in room
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}

      {!isConnected ? (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40 px-5 py-10 text-center">
          {isStarting ? <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" /> : <Video className="size-6 text-primary" aria-hidden="true" />}
          <div>
            <p className="text-sm font-medium">{isStarting ? 'Connecting your camera…' : 'Ready when you are'}</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">Your camera and microphone are only requested when you join. Room signaling is restricted to signed-in workspace members.</p>
          </div>
          <button type="button" onClick={() => { void startCall() }} disabled={isStarting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {isStarting ? <LoaderCircle className="size-4 animate-spin" /> : <Video className="size-4" />}Join with camera
          </button>
          <button type="button" onClick={onLeave} disabled={isStarting} className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">Back to rooms</button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <VideoTile stream={localStream} label={displayName} muted cameraEnabled={cameraEnabled} />
            {tiles.map(([peerId, remote]) => <VideoTile key={peerId} stream={remote.stream} label={remote.displayName} />)}
          </div>
          {participants.length === 0 && <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">You’re connected. Teammates appear here when they join this room.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => {
              const next = !micEnabled
              localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
              setMicEnabled(next)
            }} aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'} aria-pressed={micEnabled} className="inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
              {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </button>
            <button type="button" onClick={() => {
              const next = !cameraEnabled
              localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
              setCameraEnabled(next)
            }} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} aria-pressed={cameraEnabled} className="inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-secondary">
              {cameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
            </button>
            <button type="button" onClick={leaveCall} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-medium text-destructive-foreground">
              <PhoneOff className="size-4" />Leave room
            </button>
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">Direct peer-to-peer video uses WebRTC. Some restricted networks may require a TURN relay.</p>
        </>
      )}
    </section>
  )
}

export default StudioLiveRoom
