begin;
-- Existing founder/administrator policy still controls updates. Content edits are
-- further restricted to the original author, including direct Data API writes.
create or replace function public.studio_founder_update_author_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (new.title is distinct from old.title or new.body is distinct from old.body)
     and auth.uid() is distinct from old.author_id then
    raise exception 'You can edit only your own announcements' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.studio_founder_update_author_guard() from public, anon, authenticated;
create trigger studio_founder_update_author_guard before update on public.studio_founder_updates
for each row execute function public.studio_founder_update_author_guard();
grant update (title, body) on public.studio_founder_updates to authenticated;
commit;
