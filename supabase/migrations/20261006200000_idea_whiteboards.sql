-- Idea whiteboards: one Team board per idea (owned by the idea's author) and one Private board per member.
-- Rules of engagement (enforced here, not in the browser):
--   * Private board: only its owner can read or change anything.
--   * Team board owner: add, edit, move, resize, remove anything; check items in/out.
--   * Teammates on a Team board: add items and comments, check items out/in, copy an item to their own
--     Private board. They never move or resize items, and may only edit/remove items they added.
--   * Library items pinned to a Team board must already be shared with the workspace.
-- Reads go through RLS; every write goes through public.studio_board_mutate.

create table if not exists public.studio_boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idea_id uuid not null references public.brand_ideas(id) on delete cascade,
  scope text not null check (scope in ('team', 'private')),
  owner_id uuid not null,
  seeded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.studio_boards add column if not exists seeded_at timestamptz;
create unique index if not exists studio_boards_team_idx on public.studio_boards(idea_id) where scope = 'team';
create unique index if not exists studio_boards_private_idx on public.studio_boards(idea_id, owner_id) where scope = 'private';
create index if not exists studio_boards_workspace_idx on public.studio_boards(workspace_id);

create table if not exists public.studio_board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.studio_boards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('note', 'swatch', 'fabric', 'image', 'library')),
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 4000),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  url text check (url is null or (char_length(url) <= 2000 and url ~ '^https://')),
  image_url text check (image_url is null or (char_length(image_url) <= 2000 and image_url ~ '^https://')),
  reference_id uuid references public.saved_references(id) on delete set null,
  file_id uuid references public.workspace_files(id) on delete set null,
  x double precision not null default 0 check (x between -20000 and 20000),
  y double precision not null default 0 check (y between -20000 and 20000),
  width double precision not null default 220 check (width between 80 and 1200),
  height double precision not null default 160 check (height between 60 and 1200),
  created_by uuid not null,
  checked_out_by uuid,
  checked_out_at timestamptz,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_board_items_board_idx on public.studio_board_items(board_id, created_at);

create table if not exists public.studio_board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.studio_boards(id) on delete cascade,
  item_id uuid references public.studio_board_items(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists studio_board_comments_board_idx on public.studio_board_comments(board_id, created_at);

alter table public.studio_boards enable row level security;
alter table public.studio_board_items enable row level security;
alter table public.studio_board_comments enable row level security;
revoke all on public.studio_boards, public.studio_board_items, public.studio_board_comments from anon, authenticated;
grant select on public.studio_boards, public.studio_board_items, public.studio_board_comments to authenticated;

drop policy if exists studio_board_read on public.studio_boards;
create policy studio_board_read on public.studio_boards for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = studio_boards.workspace_id and m.user_id = (select auth.uid()))
  and (scope = 'team' or owner_id = (select auth.uid()))
);
drop policy if exists studio_board_item_read on public.studio_board_items;
create policy studio_board_item_read on public.studio_board_items for select to authenticated using (
  exists (select 1 from public.studio_boards b where b.id = studio_board_items.board_id)
);
drop policy if exists studio_board_comment_read on public.studio_board_comments;
create policy studio_board_comment_read on public.studio_board_comments for select to authenticated using (
  exists (select 1 from public.studio_boards b where b.id = studio_board_comments.board_id)
);

create or replace function public.studio_board_mutate(p_workspace uuid, p_operation text, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  board public.studio_boards%rowtype;
  item public.studio_board_items%rowtype;
  idea_author uuid;
  target_board uuid;
  is_owner boolean;
  result jsonb;
  ref_row public.saved_references%rowtype;
  file_row public.workspace_files%rowtype;
begin
  if actor is null then raise exception 'Sign in to use whiteboards' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = actor) then
    raise exception 'Workspace not found or access denied' using errcode = '42501';
  end if;
  if p_input ?| array['created_by', 'author_id', 'owner_id', 'workspace_id', 'checked_out_by'] then
    raise exception 'Identity is server assigned' using errcode = '22023';
  end if;

  if p_operation = 'ensureBoards' then
    select author_id into idea_author from public.brand_ideas where workspace_id = p_workspace and id = (p_input->>'idea_id')::uuid;
    if not found then raise exception 'Idea not found' using errcode = '22023'; end if;
    insert into public.studio_boards(workspace_id, idea_id, scope, owner_id)
      values (p_workspace, (p_input->>'idea_id')::uuid, 'team', coalesce(idea_author, actor))
      on conflict do nothing;
    insert into public.studio_boards(workspace_id, idea_id, scope, owner_id)
      values (p_workspace, (p_input->>'idea_id')::uuid, 'private', actor)
      on conflict do nothing;
    select coalesce(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb) into result from public.studio_boards b
      where b.workspace_id = p_workspace and b.idea_id = (p_input->>'idea_id')::uuid and (b.scope = 'team' or b.owner_id = actor);
    return jsonb_build_object('boards', result);
  end if;

  -- Every other operation acts on a board the actor can see.
  if p_operation in ('addItem', 'addComment', 'claimSeed') then
    target_board := (p_input->>'board_id')::uuid;
  elsif p_operation = 'deleteComment' then
    select c.board_id into target_board from public.studio_board_comments c where c.workspace_id = p_workspace and c.id = (p_input->>'id')::uuid;
  else
    select * into item from public.studio_board_items i where i.workspace_id = p_workspace and i.id = (p_input->>'id')::uuid for update;
    if not found then raise exception 'This board item no longer exists' using errcode = '22023'; end if;
    target_board := item.board_id;
  end if;
  select * into board from public.studio_boards b where b.workspace_id = p_workspace and b.id = target_board;
  if not found or (board.scope = 'private' and board.owner_id <> actor) then
    raise exception 'Board not found or access denied' using errcode = '42501';
  end if;
  is_owner := board.owner_id = actor;

  if p_operation = 'claimSeed' then
    -- Exactly one opener fills a new Team board with its starter items, even if several open it at once.
    if board.scope <> 'team' then raise exception 'Only Team boards are filled from their idea' using errcode = '22023'; end if;
    update public.studio_boards set seeded_at = now() where id = board.id and seeded_at is null;
    return jsonb_build_object('claimed', found);

  elsif p_operation = 'addItem' then
    if p_input->>'kind' = 'library' then
      if p_input->>'reference_id' is not null then
        select * into ref_row from public.saved_references r where r.workspace_id = p_workspace and r.id = (p_input->>'reference_id')::uuid;
        if not found or not (ref_row.permission_scope = 'workspace' or (board.scope = 'private' and ref_row.author_id = actor)) then
          raise exception 'Only shared Library items can be pinned to a Team board' using errcode = '42501';
        end if;
      elsif p_input->>'file_id' is not null then
        select * into file_row from public.workspace_files f where f.workspace_id = p_workspace and f.id = (p_input->>'file_id')::uuid;
        if not found or not (file_row.permission_scope = 'workspace' or (board.scope = 'private' and file_row.added_by = actor)) then
          raise exception 'Only shared Library items can be pinned to a Team board' using errcode = '42501';
        end if;
      else
        raise exception 'Choose a Library item' using errcode = '22023';
      end if;
    end if;
    insert into public.studio_board_items(board_id, workspace_id, kind, title, body, color, url, image_url, reference_id, file_id, x, y, width, height, created_by)
    values (
      board.id, p_workspace, p_input->>'kind',
      coalesce(nullif(p_input->>'title', ''), ref_row.title, file_row.title, ''),
      coalesce(p_input->>'body', ''),
      nullif(p_input->>'color', ''),
      coalesce(nullif(p_input->>'url', ''), case when ref_row.url ~ '^https://' then ref_row.url end),
      coalesce(nullif(p_input->>'image_url', ''), case when ref_row.image_url ~ '^https://' then ref_row.image_url end),
      ref_row.id, file_row.id,
      coalesce((p_input->>'x')::float, 0), coalesce((p_input->>'y')::float, 0),
      coalesce((p_input->>'width')::float, 220), coalesce((p_input->>'height')::float, 160),
      actor
    ) returning to_jsonb(studio_board_items.*) into result;
    return result;

  elsif p_operation = 'updateItem' then
    if (p_input->>'expected_revision')::integer is distinct from item.revision then
      raise exception 'This item changed. Reload the board and try again.' using errcode = '40001';
    end if;
    if not is_owner and item.created_by <> actor then
      raise exception 'Only the board owner or the person who added this item can edit it' using errcode = '42501';
    end if;
    if not is_owner and (p_input ? 'x' or p_input ? 'y' or p_input ? 'width' or p_input ? 'height') then
      raise exception 'Only the board owner can move or resize items' using errcode = '42501';
    end if;
    update public.studio_board_items set
      title = coalesce(p_input->>'title', title),
      body = coalesce(p_input->>'body', body),
      color = case when p_input ? 'color' then nullif(p_input->>'color', '') else color end,
      url = case when p_input ? 'url' then nullif(p_input->>'url', '') else url end,
      image_url = case when p_input ? 'image_url' then nullif(p_input->>'image_url', '') else image_url end,
      x = coalesce((p_input->>'x')::float, x), y = coalesce((p_input->>'y')::float, y),
      width = coalesce((p_input->>'width')::float, width), height = coalesce((p_input->>'height')::float, height),
      revision = revision + 1, updated_at = now()
    where id = item.id returning to_jsonb(studio_board_items.*) into result;
    return result;

  elsif p_operation = 'deleteItem' then
    if not is_owner and item.created_by <> actor then
      raise exception 'Only the board owner or the person who added this item can remove it' using errcode = '42501';
    end if;
    delete from public.studio_board_items where id = item.id;
    return jsonb_build_object('id', item.id, 'deleted', true);

  elsif p_operation = 'checkOut' then
    if item.checked_out_by is not null then
      raise exception 'This item is already checked out' using errcode = '40001';
    end if;
    update public.studio_board_items set checked_out_by = actor, checked_out_at = now(), revision = revision + 1, updated_at = now()
      where id = item.id returning to_jsonb(studio_board_items.*) into result;
    return result;

  elsif p_operation = 'checkIn' then
    if item.checked_out_by is null then return to_jsonb(item); end if;
    if item.checked_out_by <> actor and not is_owner then
      raise exception 'Only the person who checked this out, or the board owner, can check it back in' using errcode = '42501';
    end if;
    update public.studio_board_items set checked_out_by = null, checked_out_at = null, revision = revision + 1, updated_at = now()
      where id = item.id returning to_jsonb(studio_board_items.*) into result;
    return result;

  elsif p_operation = 'copyToPrivate' then
    if board.scope <> 'team' then raise exception 'Only Team board items can be copied' using errcode = '22023'; end if;
    insert into public.studio_boards(workspace_id, idea_id, scope, owner_id) values (p_workspace, board.idea_id, 'private', actor) on conflict do nothing;
    select b.id into target_board from public.studio_boards b where b.idea_id = board.idea_id and b.scope = 'private' and b.owner_id = actor;
    insert into public.studio_board_items(board_id, workspace_id, kind, title, body, color, url, image_url, reference_id, file_id, x, y, width, height, created_by)
      values (target_board, p_workspace, item.kind, item.title, item.body, item.color, item.url, item.image_url, item.reference_id, item.file_id, item.x, item.y, item.width, item.height, actor)
      returning to_jsonb(studio_board_items.*) into result;
    return result;

  elsif p_operation = 'addComment' then
    if p_input->>'item_id' is not null and not exists (select 1 from public.studio_board_items i where i.id = (p_input->>'item_id')::uuid and i.board_id = board.id) then
      raise exception 'This board item no longer exists' using errcode = '22023';
    end if;
    insert into public.studio_board_comments(board_id, item_id, workspace_id, author_id, body)
      values (board.id, (p_input->>'item_id')::uuid, p_workspace, actor, btrim(p_input->>'body'))
      returning to_jsonb(studio_board_comments.*) into result;
    return result;

  elsif p_operation = 'deleteComment' then
    delete from public.studio_board_comments c where c.id = (p_input->>'id')::uuid and c.board_id = board.id and (c.author_id = actor or is_owner)
      returning to_jsonb(c.*) into result;
    if result is null then raise exception 'Only the comment author or board owner can remove this comment' using errcode = '42501'; end if;
    return jsonb_build_object('id', result->>'id', 'deleted', true);
  end if;

  raise exception 'Unsupported whiteboard action' using errcode = '22023';
end;
$$;

revoke all on function public.studio_board_mutate(uuid, text, jsonb) from public, anon;
grant execute on function public.studio_board_mutate(uuid, text, jsonb) to authenticated;
comment on function public.studio_board_mutate(uuid, text, jsonb) is 'All idea whiteboard writes. Enforces Team/Private board rules of engagement.';
