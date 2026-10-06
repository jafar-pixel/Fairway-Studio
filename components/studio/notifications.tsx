"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Bell, Check, X } from "lucide-react";
export function NotificationInbox({
  data,
  workspaceId,
  userId,
  onNavigate,
}: any) {
  const [open, setOpen] = useState(false),
    [read, setRead] = useState<string[]>([]);
  const key = `fairway-notification-read:${userId}:${workspaceId}`;
  useEffect(() => {
    try {
      setRead(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setRead([]);
    }
  }, [key]);
  const events = data.notificationPreferences?.events || {};
  const items: any[] = [];
  const jobs = useSWR(
    workspaceId !== "demo" && events.generations !== false
      ? [`/api/studio/generation?workspaceId=${workspaceId}`, userId]
      : null,
    async ([url]: [string, string]) => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return { jobs: [] };
      return r.json();
    },
    { revalidateOnFocus: true },
  );
  if (events.generations !== false)
    for (const j of jobs.data?.jobs || [])
      if (j.status === "succeeded")
        items.push({
          id: `generation:${j.id}`,
          title: "Image generation completed",
          detail: j.request?.prompt || "Draft outputs are ready to review",
          url: `/w/${workspaceId}/projects/${j.project_id}/canvas`,
        });
  const self = data.members.find((m: any) => m.user_id === userId),
    handle = self?.display_name;
  const unique =
    handle &&
    data.members.filter((m: any) => m.display_name === handle).length === 1;
  if (events.mentions !== false)
    for (const m of data.messages || [])
      if (
        m.author_id !== userId &&
        (m.body.includes(`@${userId}`) ||
          (unique && m.body.includes(`@${handle}`)))
      )
        items.push({
          id: `mention:${m.id}`,
          title: "You were mentioned",
          detail: m.body,
          url: `/w/${workspaceId}/conversations/${m.thread_id || "workspace"}`,
        });
  if (events.reviews !== false)
    for (const r of data.rounds || [])
      if (
        (r.status || r.state) === "open" &&
        (r.reviewers || r.reviewer_ids || []).includes(userId) &&
        !(data.reviews || []).some(
          (v: any) =>
            v.round_id === r.id &&
            v.reviewer_id === userId &&
            (!v.state || v.state === "submitted"),
        )
      )
        items.push({
          id: `review:${r.id}`,
          title: "Your review is requested",
          detail:
            data.projects.find((p: any) => p.id === r.project_id)?.title ||
            r.scope,
          url: `/w/${workspaceId}/projects/${r.project_id}/reviews?round=${r.id}`,
        });
  if (events.assignments !== false)
    for (const t of data.tasks || [])
      if (t.assigned_to === userId && t.status !== "done")
        items.push({
          id: `task:${t.id}`,
          title: t.title,
          detail: "Assigned to you",
          url: `/w/${workspaceId}/tasks?item=${t.id}`,
        });
  if (events.decisions !== false)
    for (const d of (data.decisions || []).slice(0, 5)) {
      const r = data.rounds.find((r: any) => r.id === d.round_id);
      items.push({
        id: `decision:${d.id}`,
        title: "A decision was recorded",
        detail: `${d.scope || r?.scope || "Concept"} · ${d.rationale || "View evidence"}`,
        url: `/w/${workspaceId}/projects/${d.project_id || r?.project_id}/decisions`,
      });
    }
  if (events.sessions !== false)
    for (const r of data.rooms || [])
      if (r.starts_at && new Date(r.starts_at) > new Date())
        items.push({
          id: `session:${r.id}`,
          title: r.title,
          detail: `Work session · ${new Date(r.starts_at).toLocaleString()}`,
          url: `/w/${workspaceId}/conversations`,
        });
  const unread = items.filter((i) => !read.includes(i.id));
  function mark() {
    const ids = Array.from(new Set([...read, ...items.map((i) => i.id)]));
    setRead(ids);
    localStorage.setItem(key, JSON.stringify(ids));
  }
  return (
    <div className="fs-quick">
      <button
        className="fs-icon relative"
        aria-label={`Notifications, ${unread.length} unread`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={19} />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#760d24]" />
        )}
      </button>
      {open && (
        <section className="fs-dropdown !w-[min(360px,85vw)] !max-h-[65vh] overflow-auto">
          <div className="flex items-center justify-between p-2">
            <strong>Notifications</strong>
            <button
              className="!w-auto !p-2"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {items.length ? (
            items.map((i) => (
              <button
                className="flex flex-col gap-1"
                key={i.id}
                onClick={() => {
                  const ids = [...read, i.id];
                  setRead(ids);
                  localStorage.setItem(key, JSON.stringify(ids));
                  setOpen(false);
                  onNavigate(i.url);
                }}
              >
                <span className={!read.includes(i.id) ? "font-semibold" : ""}>
                  {i.title}
                </span>
                <small className="text-gray-500 line-clamp-2">{i.detail}</small>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-gray-500">
              You’re up to date for your enabled notification categories.
            </p>
          )}
          <button
            className="!flex items-center gap-2 text-[#760d24]"
            onClick={mark}
          >
            <Check size={16} />
            Mark all read on this device
          </button>
          <button
            className="text-xs"
            onClick={() => {
              setOpen(false);
              onNavigate(`/w/${workspaceId}/settings/notifications`);
            }}
          >
            Notification preferences
          </button>
        </section>
      )}
    </div>
  );
}
