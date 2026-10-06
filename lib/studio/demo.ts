import content from './mockup-content.json';
import assetHashes from './mockup-asset-hashes.json';
import { hydrateImportedContent } from './imported-content';

// Isolated, ephemeral how-to examples. They are never sent to Supabase.
export function createDemoData(): any {
  const stamp = '2026-10-02T08:00:00Z';
  const row = (id: string, extra: object) => ({ id, workspace_id: 'demo', created_at: stamp, updated_at: stamp, revision: 0, ...extra });
  const projectId = (key: string) => content.projects.find(p => p.key === key)!.demo_id;
  const versionId = (key: string) => content.versions.find(v => v.key === key)!.demo_id;
  const founders = ['demo-jafar', 'demo-arlin', 'demo-kyle'];
  const versions = content.versions.map((entry: any) => {
    const {key, demo_id, title, project, body, asset, ...metadata} = entry;
    return row(demo_id, {
      project_id: projectId(project), title, body, created_by: 'demo-jafar',
      media_verification: asset ? 'bundled_exploratory' : 'text_only',
      provenance: {
        ...metadata, import_key: key, import_batch: content.import_batch,
        mockup_import: true, tutorial: true, type: 'mockup_import',
        media_origin: metadata.media_origin || 'bundled_exploratory', project_key: project, import_asset_path: asset,
        task_ids: content.tasks.filter(t => (metadata.task_titles || []).includes(t.title)).map(t => t.demo_id),
        asset_sha256: asset ? (assetHashes as Record<string, string>)[asset] : undefined,
        source: metadata.media_origin === 'bundled_original' ? 'User-supplied original artwork' : 'Recreated from supplied mockup',
        generated_for_import: Boolean(asset) && metadata.media_origin !== 'bundled_original', approval_status: 'unapproved',
      },
    });
  });
  const task = (t: any) => row(t.demo_id, {
    title: t.title, details: `${t.details}\n\n[Fairway tutorial] Example task; status and assignee are demonstration data.`,
    category: t.category, status: t.demo_status, assigned_to: t.demo_assignee,
    created_by: 'demo-jafar', project_id: projectId(t.project),
    priority: 'normal', due_date: null, checklist: t.checklist || [], is_tutorial: true, surface: t.surface || 'board',
  });
  const data = {
    workspace: { id: 'demo', name: 'Founders’ Studio', timezone: 'America/Los_Angeles', revision: 0, review_policy: { policy: 'unanimous' } },
    userId: 'demo-jafar', role: 'owner', missingSchema: [],
    capabilities: { collaboration: true, governance: true },
    members: [
      { user_id: 'demo-jafar', display_name: 'Jafar', role: 'owner', is_founder: true, focus: 'Technology & product' },
      { user_id: 'demo-arlin', display_name: 'Arlin', role: 'editor', is_founder: true, focus: 'Golf & style' },
      { user_id: 'demo-kyle', display_name: 'Kyle', role: 'editor', is_founder: true, focus: 'Fashion design' },
    ],
    ideas: content.ideas.map(i => row(i.demo_id, {
      title: i.title, body: i.body, category: i.category, status: i.demo_status,
      author_id: 'demo-jafar', contributor_ids: founders, project_id: projectId(i.project),
      tags: [...i.tags, 'Starter collection', `mockup-idea:${i.key}`], is_tutorial: true,
    })),
    projects: content.projects.map(p => row(p.demo_id, {
      title: p.title, category: p.category, type: p.category, brief: p.brief, objective: p.brief,
      status: 'active', phase: p.demo_phase, lead_id: p.demo_lead,
      created_by: 'demo-jafar', next_step: p.next_step, is_tutorial: true,
    })),
    tasks: content.tasks.map(task),
    home_actions: content.tasks.filter((t: any) => t.surface === 'home').map(task),
    nextActions: content.tasks.filter((t: any) => t.surface === 'home').map(task),
    projectNextActions: content.tasks.filter((t: any) => t.surface === 'project').map(task),
    references: [], files: [], rooms: [], invites: [],
    versions,
    nodes: content.nodes.map((n: any) => row(`demo-node-${n.key}`, {
      ...n, project_id: projectId(n.project), version_id: n.version ? versionId(n.version) : null,
    })),
    ideaAssets: content.ideas.map(i => row(`demo-idea-asset-${i.key}`, { idea_id: i.demo_id, version_id: versionId(i.version), created_by: 'demo-jafar' })),
    ideaProjects: content.ideas.map(i => row(`demo-idea-project-${i.key}`, { idea_id: i.demo_id, project_id: projectId(i.project), created_by: 'demo-jafar' })),
    rounds: [
      row('demo-round', { project_id: 'demo-identity', version_id: 'demo-v3', scope: 'name', state: 'open', status: 'open', reviewer_ids: founders, reviewers: founders, policy: 'unanimous', threshold: 3, created_by: 'demo-jafar' }),
      row('demo-bag-round', { project_id: 'demo-bag', version_id: 'demo-bag-v2', scope: 'concept', state: 'open', status: 'open', reviewer_ids: founders, reviewers: founders, policy: 'unanimous', threshold: 3, created_by: 'demo-jafar' }),
    ],
    reviews: [], decisions: [], kits: [], activity: [
      row('demo-activity-1', { actor_id: 'demo-jafar', operation: 'Sample activity', entity_id: 'demo-bag', body: 'Added a note to Signature golf bag', payload: { summary: 'Added a note to Signature golf bag', sample: true } }),
      row('demo-activity-2', { actor_id: 'demo-arlin', operation: 'Sample activity', entity_id: 'demo-identity', body: 'Uploaded a new image to Common Form identity', payload: { summary: 'Uploaded a new image to Common Form identity', sample: true } }),
      row('demo-activity-3', { actor_id: 'demo-kyle', operation: 'Sample activity', entity_id: 'demo-apparel', body: 'Updated the brief for First apparel collection', payload: { summary: 'Updated the brief for First apparel collection', sample: true } }),
    ], outcomes: [], supersessions: [],
    threads: content.threads.map(t => row(t.key === 'bag' ? 'demo-thread' : `demo-thread-${t.key}`, { title: t.title, project_id: projectId(t.project), description: t.description, created_by: 'demo-jafar', is_tutorial: true })),
    messages: [
      row('demo-message-jafar', { thread_id: 'demo-thread', author_id: 'demo-jafar', body: 'Can we make the tech feel built into the bag?', is_sample: true }),
      row('demo-message', { thread_id: 'demo-thread', author_id: 'demo-arlin', body: 'Keep the silhouette clean and the pockets easy to reach.', is_sample: true }),
      row('demo-message-kyle', { thread_id: 'demo-thread', author_id: 'demo-kyle', body: 'Let’s compare the seam and trim placement.', version_id: 'demo-bag-v2', is_sample: true }),
    ],
    notificationPreferences: { revision: 0, events: { mentions: true, assignments: true, reviews: true, decisions: true, sessions: true, generations: true } },
  };
  return hydrateImportedContent(data);
}

export function mutateDemo(
  original: any,
  operation: string,
  input: any,
): { data: any; result: any } {
  const data = structuredClone(original),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  const row = {
    id,
    workspace_id: "demo",
    created_at: now,
    updated_at: now,
    revision: 0,
    ...input,
  };
  let result: any = row;
  const add = (key: string, extra: object = {}) => {
    result = { ...row, ...extra };
    data[key].unshift(result);
  };
  const update = (key: string) => {
    const index = data[key].findIndex((r: any) => r.id === input.id);
    if (index < 0) throw Error("Item not found.");
    if (
      input.expected_revision !== undefined &&
      input.expected_revision !== data[key][index].revision
    )
      throw Error("This item changed. Reload and review changes.");
    data[key][index] = {
      ...data[key][index],
      ...input,
      revision: data[key][index].revision + 1,
    };
    result = data[key][index];
  };
  switch (operation) {
    case "createIdea":
      add("ideas", {
        status: input.status || "exploring",
        author_id: "demo-jafar",
      });
      break;
    case "updateIdea":
      update("ideas");
      break;
    case "archiveIdea":
      input.archived_at = now;
      update("ideas");
      break;
    case "restoreIdea":
      input.archived_at = null;
      update("ideas");
      break;
    case "createTask":
      add("tasks", {
        status: input.status || "open",
        created_by: "demo-jafar",
      });
      break;
    case "updateTask":
      update("tasks");
      break;
    case "createProject":
      add("projects", { phase: "exploring" });
      break;
    case "updateProject":
      update("projects");
      break;
    case "promoteIdea": {
      const idea = data.ideas.find((r: any) => r.id === input.idea_id);
      if (!idea) throw Error("Idea not found");
      if (idea.promoted_project_id) {
        result = data.projects.find(
          (r: any) => r.id === idea.promoted_project_id,
        );
        break;
      }
      add("projects", {
        title: input.title || idea.title,
        phase: "exploring",
        objective: input.objective || idea.body,
      });
      idea.promoted_project_id = id;
      break;
    }
    case "createVersion":
      add("versions", {
        version_number:
          data.versions.filter((v: any) => v.project_id === input.project_id)
            .length + 1,
      });
      break;
    case "saveCanvas":
      if (Array.isArray(input.nodes)) {
        data.nodes = data.nodes
          .filter((n: any) => n.project_id !== input.project_id)
          .concat(input.nodes);
        result = input.nodes;
      } else add("nodes");
      break;
    case "openReview":
      add("rounds", {
        state: "open",
        policy: input.policy || { mode: "unanimous" },
        status: "open",
        reviewers:
          input.reviewers ||
          input.reviewer_ids ||
          data.members.map((m: any) => m.user_id),
        reviewer_ids:
          input.reviewers ||
          input.reviewer_ids ||
          data.members.map((m: any) => m.user_id),
      });
      break;
    case "submitReview": {
      const round = data.rounds.find((r: any) => r.id === input.round_id);
      if (
        !round ||
        round.state !== "open" ||
        !round.reviewer_ids.includes("demo-jafar")
      )
        throw Error("Review unavailable");
      if (input.version_id && input.version_id !== round.version_id)
        throw Error("Wrong version");
      if (input.disposition === "request_changes" && !input.comment?.trim())
        throw Error("Explain what should change");
      data.reviews = data.reviews.filter(
        (r: any) =>
          !(r.round_id === input.round_id && r.reviewer_id === "demo-jafar"),
      );
      add("reviews", {
        version_id: round.version_id,
        reviewer_id: "demo-jafar",
        state: input.state || "submitted",
      });
      break;
    }
    case "recordDecision": {
      const round = data.rounds.find((r: any) => r.id === input.round_id);
      if (!round || round.state !== "open") throw Error("Round unavailable");
      const reviews = data.reviews.filter(
        (r: any) => r.round_id === round.id && r.state === "submitted",
      );
      if (
        !round.reviewer_ids.every((id: string) =>
          reviews.some(
            (r: any) => r.reviewer_id === id && r.disposition === "approve",
          ),
        )
      )
        throw Error(
          "All required founders must explicitly approve this version.",
        );
      add("decisions", {
        version_id: round.version_id,
        scope: round.scope,
        reviews,
      });
      round.state = "closed";
      round.status = "closed";
      break;
    }
    case "publishKit":
      throw Error(
        "A name, logo and palette each need recorded decisions before publishing.",
      );
    case "createThread":
      add("threads");
      break;
    case "sendMessage":
      add("messages", { author_id: "demo-jafar" });
      break;
    case "updateWorkspace":
      data.workspace = {
        ...data.workspace,
        ...input,
        revision: data.workspace.revision + 1,
      };
      result = data.workspace;
      break;
    case "updateReviewPolicy":
      data.workspace.review_policy =
        typeof input.policy === "string"
          ? { policy: input.policy, threshold: input.threshold }
          : input.policy;
      break;
    case "importPin":
    case "createReference": {
      const existing = data.references.find((r: any) => r.url === input.url);
      if (existing) result = existing;
      else add("references", { author_id: "demo-jafar" });
      break;
    }
    case "updateReference":
      update("references");
      break;
    case "archiveReference":
      input.archived_at = now;
      update("references");
      break;
    case "restoreReference":
      input.archived_at = null;
      update("references");
      break;
    case "createExternalFile":
      add("files", {
        added_by: "demo-jafar",
        provider: "other",
        permission_scope: "workspace",
      });
      break;
    case "updateFile":
      update("files");
      break;
    case "updateNotificationPreferences":
      data.notificationPreferences = {
        events: input.events,
        revision: (data.notificationPreferences?.revision || 0) + 1,
      };
      result = data.notificationPreferences;
      break;
    case "linkIdeaAsset":
      data.ideaAssets ||= [];
      add("ideaAssets");
      {
        const idea = data.ideas.find((i: any) => i.id === input.idea_id);
        if (idea) idea.revision++;
      }
      break;
    case "unlinkIdeaAsset":
      data.ideaAssets = (data.ideaAssets || []).filter(
        (x: any) => x.id !== input.id,
      );
      break;
    case "linkIdeaProject":
      data.ideaProjects ||= [];
      if (
        !data.ideaProjects.some(
          (x: any) =>
            x.idea_id === input.idea_id && x.project_id === input.project_id,
        )
      )
        add("ideaProjects");
      break;
    case "unlinkIdeaProject":
      data.ideaProjects = (data.ideaProjects || []).filter(
        (x: any) =>
          x.id !== input.id &&
          !(x.idea_id === input.idea_id && x.project_id === input.project_id),
      );
      break;
    case "deferDecision": {
      const r = data.rounds.find((r: any) => r.id === input.round_id);
      if (!input.rationale?.trim() || !r)
        throw Error("Choose a round and give a rationale.");
      r.state = "closed";
      r.status = "closed";
      data.outcomes ||= [];
      add("outcomes", { outcome: "deferred" });
      break;
    }
    case "rejectDecision":
      throw Error(
        "Every assigned reviewer must respond before recording a rejection.",
      );
    case "supersedeDecision":
      throw Error(
        "A recorded decision is required before a fresh superseding review can be opened.",
      );
    case "updateMember": {
      const m = data.members.find((m: any) => m.user_id === input.user_id);
      if (!m) throw Error("Member unavailable");
      if (
        m.role === "owner" &&
        input.role !== "owner" &&
        data.members.filter((m: any) => m.role === "owner").length === 1
      )
        throw Error("The last owner cannot be demoted.");
      Object.assign(m, input);
      break;
    }
    case "removeMember": {
      const m = data.members.find((m: any) => m.user_id === input.user_id);
      if (
        m?.role === "owner" &&
        data.members.filter((m: any) => m.role === "owner").length === 1
      )
        throw Error("The last owner cannot be removed.");
      data.members = data.members.filter(
        (m: any) => m.user_id !== input.user_id,
      );
      break;
    }
    default:
      throw Error(
        "This action needs the connected workspace. No change was saved.",
      );
  }
  return { data, result };
}
