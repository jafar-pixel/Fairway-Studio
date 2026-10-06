"use client";
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Trash2, RotateCcw } from 'lucide-react';
import { DEFAULT_PHOTO_CROP, PROFILE_OUTPUT_SIZE, profileCropRect, profileFileError, profilePhotoDimensions, type PhotoCrop } from '@/lib/studio/profile-photo';
import { ProfileAvatar, useProfilePhotos } from './profile-avatar';
import { useProfilePhotoNavigation } from './profile-photo-navigation';
type PhotoState = { photo: { revision: number; path: string | null } | null; revision: number; warning?: string };
async function readResponse(response: Response): Promise<PhotoState> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Your photo could not be saved. Please retry.');
  return { photo: result.photo || null, revision: result.revision ?? result.photo?.revision ?? 0, warning: typeof result.warning === 'string' ? result.warning : undefined };
}
export function ProfilePhotoEditor({ name, userId }: { name: string; userId: string }) {
  const scope = useProfilePhotos();
  const input = useRef<HTMLInputElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const selectedUrl = useRef<string | null>(null), sequence = useRef(0);
  const [source, setSource] = useState<HTMLImageElement | null>(null), [crop, setCrop] = useState<PhotoCrop>(DEFAULT_PHOTO_CROP);
  const [state, setState] = useState<PhotoState>({ photo: null, revision: 0 });
  const [ready, setReady] = useState(scope.demo);
  const [loading, setLoading] = useState(!scope.demo), [busy, setBusy] = useState(false), [decoding, setDecoding] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirmRemove, setConfirmRemove] = useState(false);
  const guard = useProfilePhotoNavigation({ dirty: !!source, busy: busy || decoding, onBlocked: setError });
  useEffect(() => { if (scope.demo) return; const controller = new AbortController(); setLoading(true); fetch('/api/studio/profile-photo', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }).then(readResponse).then(value => { setState(value); setReady(true); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [scope.demo, userId]);
  useEffect(() => () => { sequence.current++; if (selectedUrl.current) URL.revokeObjectURL(selectedUrl.current); }, []);
  useEffect(() => { if (!source || !canvas.current) return; const context = canvas.current.getContext('2d'); if (!context) return; const rect = profileCropRect(source.naturalWidth, source.naturalHeight, crop); context.fillStyle = '#ffffff'; context.fillRect(0, 0, PROFILE_OUTPUT_SIZE, PROFILE_OUTPUT_SIZE); context.drawImage(source, rect.x, rect.y, rect.size, rect.size, 0, 0, PROFILE_OUTPUT_SIZE, PROFILE_OUTPUT_SIZE); }, [source, crop]);
  const hasPhoto = scope.demo ? !!scope.demoPhoto : !!state.photo?.path;
  function clearSelection() { sequence.current++; setSource(null); setCrop(DEFAULT_PHOTO_CROP); if (selectedUrl.current) URL.revokeObjectURL(selectedUrl.current); selectedUrl.current = null; if (input.current) input.current.value = ''; }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError(''); setNotice(''); setConfirmRemove(false);
    const invalid = profileFileError(file); if (invalid) { setError(invalid); event.target.value = ''; return; }
    clearSelection(); const ticket = ++sequence.current; setDecoding(true);
    try {
      profilePhotoDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
      if (ticket !== sequence.current) return;
      const url = URL.createObjectURL(file); selectedUrl.current = url;
      const img = new Image(); img.src = url; await img.decode();
      profileCropRect(img.naturalWidth, img.naturalHeight, DEFAULT_PHOTO_CROP);
      if (ticket === sequence.current) { setSource(img); setCrop(DEFAULT_PHOTO_CROP); }
    } catch (e) { if (ticket === sequence.current) { clearSelection(); setError(e instanceof Error ? e.message : 'This photo could not be opened. Use a valid JPEG, PNG or WebP under 40 megapixels.'); } }
    finally { if (ticket === sequence.current || !selectedUrl.current) setDecoding(false); }
  }
  async function refreshMetadata() { const fresh = await readResponse(await fetch('/api/studio/profile-photo', { cache: 'no-store', credentials: 'same-origin' })); setState(fresh); setReady(true); scope.refresh(); }
  async function save() {
    if (!source || !canvas.current || busy || !ready) return; const ticket = sequence.current; setBusy(true); setError(''); setNotice(''); setConfirmRemove(false);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(value => value ? resolve(value) : reject(new Error('Your browser could not crop this photo.')), 'image/jpeg', 0.9));
      if (ticket !== sequence.current) return;
      let warning = '';
      if (scope.demo) scope.setDemoPhoto(URL.createObjectURL(blob));
      else { const form = new FormData(); form.set('photo', blob, 'profile.jpg'); form.set('expectedRevision', String(state.revision)); const result = await readResponse(await fetch('/api/studio/profile-photo', { method: 'POST', headers: { 'X-Fairway-Profile-User': userId }, body: form, credentials: 'same-origin' })); setState(result); warning = result.warning || ''; scope.refresh(); }
      if (ticket !== sequence.current) return;
      clearSelection(); setNotice(scope.demo ? 'Demo photo updated for this session. Nothing was uploaded.' : `Profile photo saved. Your team will see it throughout the studio.${warning ? ` ${warning}` : ''}`);
    } catch (e) { setError((e as Error).message); if (!scope.demo) { try { await refreshMetadata(); } catch { /* Keep the original actionable error and selected crop. */ } } }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(''); setNotice('');
    try { let warning = ''; if (scope.demo) scope.setDemoPhoto(null); else { const result = await readResponse(await fetch('/api/studio/profile-photo', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Fairway-Profile-User': userId }, body: JSON.stringify({ expectedRevision: state.revision }), credentials: 'same-origin' })); setState(result); warning = result.warning || ''; scope.refresh(); } clearSelection(); setConfirmRemove(false); setNotice(`Photo removed. Your initials are shown again.${warning ? ` ${warning}` : ''}`); }
    catch (e) { setConfirmRemove(false); setError((e as Error).message); if (!scope.demo) { try { await refreshMetadata(); } catch {} } }
    finally { setBusy(false); }
  }
  return <section className="fs-card profile-photo-card" aria-labelledby="profile-photo-heading">
    <h2 id="profile-photo-heading">Your profile photo</h2>
    <p className="profile-photo-help">Your photo appears beside your ideas, conversations, reviews and team activity. Only you can change it. People who share a workspace with you can see it.</p>
    <div className="profile-photo-current"><ProfileAvatar name={name} userId={userId} /><div><strong>{name}</strong><p>{hasPhoto ? 'Your current profile photo' : 'Your initials are shown until you add a photo.'}</p></div></div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" hidden onChange={choose} disabled={busy || decoding || loading || !ready} />
    <div className="profile-photo-actions"><button type="button" className="fs-button" onClick={() => input.current?.click()} disabled={busy || decoding || loading || !ready}><Camera size={17} />{hasPhoto ? 'Replace photo' : 'Add photo'}</button>{hasPhoto && <button type="button" className="fs-button secondary" onClick={() => setConfirmRemove(true)} disabled={busy || decoding || loading}><Trash2 size={16} />Remove photo</button>}</div>
    <p className="profile-photo-help">JPEG, PNG or WebP, up to 8 MB. Convert HEIC to JPEG first. Photos are cropped to a square; the round preview shows how your avatar will look.</p>
    {loading && <p role="status">Loading your profile photo…</p>}{!loading && !ready && <button type="button" className="fs-button secondary" onClick={async () => { setLoading(true); setError(''); try { await refreshMetadata(); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }}>Retry loading profile</button>}{decoding && <p role="status">Opening photo…</p>}
    {error && <p role="alert" className="fs-alert error">{error}</p>}{notice && <p role="status" className="fs-inline-note">{notice}</p>}
    {source && <><div className="profile-photo-editor"><canvas ref={canvas} width={PROFILE_OUTPUT_SIZE} height={PROFILE_OUTPUT_SIZE} role="img" aria-label="Cropped profile photo preview" /><div className="profile-photo-sliders">
      <label>Zoom<input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={e => setCrop({ ...crop, zoom: Number(e.target.value) })} disabled={busy} /></label>
      <label>Horizontal position<input type="range" min="-100" max="100" step="1" value={crop.x} onChange={e => setCrop({ ...crop, x: Number(e.target.value) })} disabled={busy} /></label>
      <label>Vertical position<input type="range" min="-100" max="100" step="1" value={crop.y} onChange={e => setCrop({ ...crop, y: Number(e.target.value) })} disabled={busy} /></label>
      <button type="button" className="fs-button secondary" onClick={() => setCrop(DEFAULT_PHOTO_CROP)} disabled={busy}><RotateCcw size={16} />Reset crop</button>
    </div></div><div className="profile-photo-actions"><button type="button" className="fs-button" onClick={save} disabled={busy || loading || !ready}>{busy ? 'Saving…' : scope.demo ? 'Save demo preview' : 'Save photo'}</button><button type="button" className="fs-button secondary" onClick={() => guard(clearSelection)} disabled={busy}>Cancel</button></div></>}
    {confirmRemove && <div className="profile-photo-confirm"><p>Remove your profile photo and show your initials again?</p><div className="profile-photo-actions"><button type="button" className="fs-button" onClick={remove} disabled={busy || decoding}>{busy ? 'Removing…' : 'Yes, remove photo'}</button><button type="button" className="fs-button secondary" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep photo</button></div></div>}
  </section>;
}
