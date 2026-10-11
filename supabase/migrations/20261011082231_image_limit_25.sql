-- Owner-approved increase: 25 images and provider image attempts per workspace / rolling 24 hours.
-- Preserve the installed functions, ACLs, membership checks, locks and three-attempt job limit.
do $migration$
declare definition text;
begin
 definition := pg_get_functiondef('public.studio_claim_generation(uuid)'::regprocedure);
 if position('+j.image_count>8' in definition) = 0 then
  raise exception 'Unexpected image claim function; inspect before changing limits';
 end if;
 execute replace(definition, '+j.image_count>8', '+j.image_count>25');
 definition := pg_get_functiondef('public.studio_enqueue_generation(uuid,uuid,uuid,uuid,text,jsonb,text,integer)'::regprocedure);
 if position('+p_count>8' in definition) = 0 then
  raise exception 'Unexpected image enqueue function; inspect before changing limits';
 end if;
 execute replace(replace(definition, '+p_count>8', '+p_count>25'),
  '8 images per rolling 24 hours', '25 images per rolling 24 hours');
end $migration$;

-- Allow only jobs deferred by the old daily cap to be reconsidered under the new cap.
-- No job is executed here, and attempt records remain intact.
update public.studio_generation_jobs
set next_attempt_at=now(), error=null, updated_at=now()
where status='queued'
and error='Daily provider image-attempt allowance reached. Queued until allowance renews.';
