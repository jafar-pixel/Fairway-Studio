"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { avatarInitials, profileImageUrl } from '@/lib/studio/profile-photo';
import './profile-photo.css';
type ProfileContextValue = { viewerId: string; demo: boolean; version: number; demoPhoto: string | null; refresh: () => void; setDemoPhoto: (url: string | null) => void };
const ProfileContext = createContext<ProfileContextValue>({ viewerId: '', demo: true, version: 0, demoPhoto: null, refresh: () => {}, setDemoPhoto: () => {} });
/** Key this provider by viewer AND workspace so authenticated imagery cannot survive identity changes. */
export function ProfilePhotoProvider({ viewerId, demo, children }: { viewerId: string; demo: boolean; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [demoPhoto, setDemoPhoto] = useState<string | null>(null);
  const previousDemoPhoto = useRef<string | null>(null);
  useEffect(() => { if (previousDemoPhoto.current && previousDemoPhoto.current !== demoPhoto) URL.revokeObjectURL(previousDemoPhoto.current); previousDemoPhoto.current = demoPhoto; }, [demoPhoto]);
  useEffect(() => () => { if (previousDemoPhoto.current) URL.revokeObjectURL(previousDemoPhoto.current); }, []);
  useEffect(() => { if (demo) return; const refresh = () => setVersion(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [demo]);
  useEffect(() => clearOtherViewers(viewerId), [viewerId]);
  const context = useMemo(() => ({ viewerId, demo, version, demoPhoto, refresh: () => setVersion(value => value + 1), setDemoPhoto }), [viewerId, demo, version, demoPhoto]);
  return <ProfileContext.Provider value={context}>{children}</ProfileContext.Provider>;
}
export const useProfilePhotos = () => useContext(ProfileContext);

/**
 * One in-memory photo per viewer+member. A refresh keeps showing the previous photo until the
 * new version arrives, so avatars never flash to the bare background colour on focus or navigation.
 * The HTTP response stays no-store; only this tab holds the decoded copy.
 */
type PhotoEntry = { src: string; url: string | null; stale: string | null; settled: boolean; promise: Promise<void> };
const photoEntries = new Map<string, PhotoEntry>();
function clearOtherViewers(viewerId: string) {
  for (const [key, entry] of photoEntries) if (!key.startsWith(`${viewerId}:`)) { if (entry.url) URL.revokeObjectURL(entry.url); if (entry.stale) URL.revokeObjectURL(entry.stale); photoEntries.delete(key); }
}
function photoEntry(key: string, src: string): PhotoEntry {
  const existing = photoEntries.get(key);
  if (existing?.src === src) return existing;
  const stale = existing ? (existing.settled ? existing.url : existing.stale) : null;
  if (existing && existing.stale && existing.stale !== stale) URL.revokeObjectURL(existing.stale);
  const entry: PhotoEntry = { src, url: null, stale, settled: false, promise: Promise.resolve() };
  entry.promise = fetch(src, { credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'same-origin' })
    .then(response => response.ok && response.headers.get('content-type') === 'image/jpeg' ? response.blob() : null)
    .catch(() => null)
    .then(blob => {
      // A newer version superseded this request; it now owns the stale photo, so drop these bytes.
      if (photoEntries.get(key) !== entry) { entry.settled = true; return; }
      entry.url = blob ? URL.createObjectURL(blob) : null; entry.settled = true;
      if (entry.stale) { const old = entry.stale; entry.stale = null; setTimeout(() => URL.revokeObjectURL(old), 10_000); }
    });
  photoEntries.set(key, entry);
  return entry;
}
export function ProfileAvatar({ name, userId, small = false, className = '' }: {name: string; userId?: string; small?: boolean; className?: string}) {
  const scope = useProfilePhotos();
  const remoteSrc = scope.demo ? null : profileImageUrl(userId, scope.version);
  const entry = remoteSrc && userId && scope.viewerId && typeof window !== 'undefined' ? photoEntry(`${scope.viewerId}:${userId.toLowerCase()}`, remoteSrc) : null;
  const [, settle] = useState(0);
  useEffect(() => { if (!entry || entry.settled) return; let live = true; entry.promise.then(() => { if (live) settle(value => value + 1); }); return () => { live = false; }; }, [entry]);
  const src = scope.demo ? (scope.viewerId === userId ? scope.demoPhoto : null) : entry ? (entry.settled ? entry.url : entry.stale) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const avatarTone = Array.from(userId || name || 'member').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 4;
  return <span className={`fs-avatar profile-avatar ${small ? 'small' : ''} ${className}`} data-profile-user={userId || undefined} data-avatar-tone={avatarTone} data-initial={name?.charAt(0).toUpperCase()} title={name} aria-label={name ? `${name} profile` : 'Unassigned'} role="img">
    {src && failedSrc !== src ? <img key={src} src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} /> : avatarInitials(name)}
  </span>;
}
