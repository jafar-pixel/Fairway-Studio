-- A restrictive policy filters reads but cannot grant them on its own.
-- Restore the existing member/visibility contract without relaxing its guard.
create policy studio_files_member_read on public.workspace_files
as permissive for select to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = workspace_files.workspace_id
      and m.user_id = (select auth.uid())
  )
  and (permission_scope = 'workspace' or added_by = (select auth.uid()))
);
