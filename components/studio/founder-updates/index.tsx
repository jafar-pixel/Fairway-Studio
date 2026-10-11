"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageCircle, Pin, Plus } from "lucide-react";
import type { NavigationState } from "@/lib/studio/business/shell";
import { createFounderUpdateRequest, FounderUpdatesApiError, readFounderUpdates, sendFounderUpdateRequest } from "@/lib/studio/founder-updates/client";
import type { FounderUpdateMutation, FounderUpdatesFeed } from "@/lib/studio/founder-updates/contracts";
import { clearSubmittedComment } from "@/lib/studio/founder-updates/drafts";
import type { FounderUpdatePost } from "@/lib/studio/founder-updates/contracts";
import styles from "./founder-updates.module.css";

const evolutionBody = `Fairway Studio began with a shared belief: the strongest creative work does not come from a single prompt or a single person. It comes from people bringing different instincts to the same table, using AI as a collaborative design material while keeping human taste, authorship, and judgment at the center.

Arlin brought forward the Hunter & Heckard name, giving the brand a voice rooted in heritage, character, and the culture of golf. Jafar developed the first logo concept, turning that early direction into a visual starting point the team could see, question, and build on together.

That exchange became the model for Fairway Studio: ideas remain connected to their source, concepts can evolve without erasing who contributed what, and founders can review the same work in one place. AI helps us explore more directions and make iteration faster; it does not replace the people responsible for the story, the design decisions, or the final call.

Founder Updates is where we will share the decisions, context, and milestones that shape that work—so the team can understand not only what changed, but why.`;

const demoFeed: FounderUpdatesFeed = {
  schemaVersion: 1, userId: "demo-jafar", role: "owner", isFounder: true, canPost: false, canPin: false,
  posts: [{ id: "demo-evolution", title: "The Evolution of Fairway Studio", body: evolutionBody, author_id: "demo-jafar", author_name: "Jafar", is_pinned: true, created_at: "2026-10-10T12:00:00Z", comments: [] }],
};

function dateLabel(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "FS"; }

export function FounderUpdatesBoard({ workspaceId, demo = false, onNavigationStateChange }: { workspaceId: string; demo?: boolean; onNavigationStateChange?: (state: NavigationState) => void }) {
  const [data, setData] = useState<FounderUpdatesFeed | null>(demo ? demoFeed : null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<FounderUpdatePost | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<FounderUpdateMutation | null>(null);
  const [failed, setFailed] = useState<{ request: FounderUpdateMutation; message: string; uncertain: boolean } | null>(null);
  const dirty = composing && Boolean(title || body) || Object.values(comments).some(Boolean);
  useEffect(() => { onNavigationStateChange?.({ dirty, pending: Boolean(pending), uncertain: failed?.uncertain === true }); return () => onNavigationStateChange?.({ dirty: false, pending: false, uncertain: false }); }, [dirty, pending, failed?.uncertain, onNavigationStateChange]);
  function refresh() {
    if (demo) return;
    const controller = new AbortController(); setLoading(true); setError("");
    void readFounderUpdates(workspaceId, false, controller.signal).then(setData).catch(cause => { if (!(cause instanceof Error && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Founder Updates could not load."); }).finally(() => setLoading(false));
    return () => controller.abort();
  }
  useEffect(refresh, [workspaceId, demo]);
  async function mutate(request: FounderUpdateMutation, message: string) {
    if (pending || (failed?.uncertain && failed.request !== request)) return;
    setPending(request); setError(""); setSuccess("");
    try { setData(await sendFounderUpdateRequest(request)); setSuccess(message); setFailed(null); if (request.operation === "createPost" || request.operation === "editPost") { setTitle(""); setBody(""); setComposing(false); setEditing(null); }
      setComments(current => clearSubmittedComment(current, request)); }
    catch (cause) { const issue = cause instanceof FounderUpdatesApiError ? cause : new FounderUpdatesApiError("The change could not be saved.", "NETWORK", 0, true); setError(issue.message); setFailed({ request, message, uncertain: issue.uncertain }); }
    finally { setPending(null); }
  }
  function submitPost(event: FormEvent) { event.preventDefault(); void mutate(createFounderUpdateRequest(workspaceId, editing ? "editPost" : "createPost", { title, body, ...(editing ? { post_id: editing.id, expected_title: editing.title, expected_body: editing.body } : {}) }), editing ? "Founder update saved." : "Founder update published."); }
  if (!workspaceId) return null;
  return <section className={styles.root} aria-label="Founder Updates">
    <div className={styles.row}>{!demo ? <button className={styles.button} disabled={Boolean(pending) || dirty || failed?.uncertain} onClick={refresh}>Refresh updates</button> : null}</div><header className={styles.header}><div><p className={styles.eyebrow}>Business Board</p><h1>Founder Updates</h1><p className={styles.muted}>Announcements, context, and milestones from the people building Fairway Studio.</p></div>{data?.canPost ? <button className={styles.primary} onClick={() => { setEditing(null); setComposing(true); }} disabled={Boolean(pending) || composing}><Plus size={16} /> New update</button> : null}</header>
    {demo ? <p className={styles.status}>Demo preview · publishing and comments are available in a connected workspace.</p> : null}
    {loading ? <p role="status" className={styles.muted}>Loading founder updates…</p> : null}
    {error ? <div role="alert" className={styles.error}>{error} {failed ? <button className={styles.link} onClick={() => void mutate(failed.request, failed.message)}>Retry same change</button> : <button className={styles.link} onClick={refresh}>Try again</button>}</div> : null}
    {success ? <p role="status" className={styles.status}>{success}</p> : null}
    {composing ? <section className={styles.composer}><h2>{editing ? "Edit your founder update" : "Publish a founder update"}</h2><form className={styles.form} onSubmit={submitPost}><label className={styles.field}>Title<input required maxLength={180} value={title} disabled={Boolean(pending)} onChange={event => setTitle(event.target.value)} /></label><label className={styles.field}>Update<textarea required maxLength={12000} value={body} disabled={Boolean(pending)} onChange={event => setBody(event.target.value)} /></label><div className={styles.row}><button className={styles.primary} disabled={Boolean(pending)}>{editing ? "Save changes" : "Publish update"}</button><button type="button" className={styles.button} disabled={Boolean(pending)} onClick={() => { setComposing(false); setEditing(null); setTitle(""); setBody(""); }}>Cancel</button></div></form></section> : null}
    <div className={styles.feed}>{data?.posts.map(post => <article className={`${styles.post} ${post.is_pinned ? styles.pinned : ""}`} key={post.id}><div className={styles.postHeader}><div>{post.is_pinned ? <span className={styles.badge}><Pin size={12} fill="currentColor" /> Pinned</span> : null}<h2>{post.title}</h2><div className={styles.meta}><span>By {post.author_name}</span><time dateTime={post.created_at}>{dateLabel(post.created_at)}</time></div></div>{data.canPost && post.author_id === data.userId ? <button className={styles.button} disabled={Boolean(pending) || composing} onClick={() => { setEditing(post); setTitle(post.title); setBody(post.body); setComposing(true); }}>Edit</button> : null}{data.canPin ? <button className={styles.button} disabled={Boolean(pending)} onClick={() => void mutate(createFounderUpdateRequest(workspaceId, "setPinned", { post_id: post.id, is_pinned: !post.is_pinned }), post.is_pinned ? "Update unpinned." : "Update pinned.")}><Pin size={14} /> {post.is_pinned ? "Unpin" : "Pin"}</button> : null}</div><div className={styles.body}>{post.body}</div><section className={styles.comments} aria-label={`Comments on ${post.title}`}><h3><MessageCircle size={15} /> {post.comments.length} comment{post.comments.length === 1 ? "" : "s"}</h3>{post.comments.map(comment => <div className={styles.comment} key={comment.id}><div className={styles.commentHeader}><span className={styles.avatar} aria-hidden="true">{initials(comment.author_name)}</span><div><strong>{comment.author_name}</strong><div className={styles.meta}><time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time></div></div></div><p>{comment.body}</p></div>)}{!demo ? <form className={styles.commentForm} onSubmit={event => { event.preventDefault(); const value = comments[post.id] || ""; void mutate(createFounderUpdateRequest(workspaceId, "addComment", { post_id: post.id, body: value }), "Comment added."); }}><input aria-label={`Comment on ${post.title}`} maxLength={2000} required placeholder="Add to the conversation" value={comments[post.id] || ""} onChange={event => setComments(current => ({ ...current, [post.id]: event.target.value }))} /><button className={styles.button} disabled={Boolean(pending)}>Comment</button></form> : null}</section></article>)}</div>
    {!loading && data && !data.posts.length ? <section className={styles.post}><h2>No founder updates yet</h2><p className={styles.muted}>Founder announcements will appear here.</p></section> : null}
  </section>;
}

export function FounderUpdatesPreview({ workspaceId, demo = false, onNavigate }: { workspaceId: string; demo?: boolean; onNavigate: () => void }) {
  const [data, setData] = useState<FounderUpdatesFeed | null>(demo ? demoFeed : null);
  useEffect(() => { if (demo || !workspaceId) return; const controller = new AbortController(); void readFounderUpdates(workspaceId, true, controller.signal).then(setData).catch(() => setData(null)); return () => controller.abort(); }, [workspaceId, demo]);
  const post = useMemo(() => data?.posts[0], [data]);
  if (!post) return null;
  return <section className={styles.preview} aria-label="Latest Founder Update"><div className={styles.postHeader}><div><p className={styles.eyebrow}>Founder Updates</p><h2>{post.title}</h2></div>{post.is_pinned ? <span className={styles.badge}><Pin size={12} fill="currentColor" /> Pinned</span> : null}</div><div className={styles.meta}><span>By {post.author_name}</span><time dateTime={post.created_at}>{dateLabel(post.created_at)}</time></div><p className={styles.body}>{post.body}</p><button className={styles.link} onClick={onNavigate}>Open Founder Updates</button></section>;
}
