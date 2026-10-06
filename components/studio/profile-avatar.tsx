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
  const context = useMemo(() => ({ viewerId, demo, version, demoPhoto, refresh: () => setVersion(value => value + 1), setDemoPhoto }), [viewerId, demo, version, demoPhoto]);
  return <ProfileContext.Provider value={context}>{children}</ProfileContext.Provider>;
}
export const useProfilePhotos = () => useContext(ProfileContext);
export function ProfileAvatar({ name, userId, small = false, className = '' }: {name: string; userId?: string; small?: boolean; className?: string}) {
  const scope = useProfilePhotos();
  const src = scope.demo ? (scope.viewerId === userId ? scope.demoPhoto : null) : profileImageUrl(userId, scope.version);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const avatarTone = Array.from(userId || name || 'member').reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 4;
  return <span className={`fs-avatar profile-avatar ${small ? 'small' : ''} ${className}`} data-profile-user={userId || undefined} data-avatar-tone={avatarTone} data-initial={name?.charAt(0).toUpperCase()} title={name} aria-label={name ? `${name} profile` : 'Unassigned'} role="img">
    {src && failedSrc !== src ? <img key={src} src={src} alt="" draggable={false} referrerPolicy="same-origin" onError={() => setFailedSrc(src)} /> : avatarInitials(name)}
  </span>;
}
