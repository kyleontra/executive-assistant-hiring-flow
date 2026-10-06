create table if not exists public.candidate_onboarding_steps (
 user_id uuid not null references auth.users(id) on delete cascade,
 step text not null check(step in ('account','email','welcome','resume','photo','id_photos','id_video','identity','platform','contract','next_steps','review','career','preferences','intro','recording')),
 first_seen_at timestamptz, last_seen_at timestamptz, completed_at timestamptz,
 error_count integer not null default 0, primary key(user_id,step)
);
alter table public.candidate_onboarding_steps drop constraint if exists candidate_onboarding_steps_step_check;
alter table public.candidate_onboarding_steps add constraint candidate_onboarding_steps_step_check check(step in ('account','email','welcome','resume','photo','id_photos','id_video','identity','platform','contract','next_steps','review','career','preferences','intro','recording'));
alter table public.candidate_onboarding_steps enable row level security;
revoke all on public.candidate_onboarding_steps from public,anon,authenticated;
grant all on public.candidate_onboarding_steps to service_role;
create or replace function public.record_onboarding_step(candidate_id uuid,step_id text,event_type text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if (event_type='videoComplete' and step_id not in ('welcome','intro','next_steps')) then raise exception 'Invalid video completion'; end if;
 if event_type not in ('visit','error','welcomeComplete','videoComplete') or (event_type='welcomeComplete' and step_id<>'welcome') then raise exception 'Invalid event'; end if;
 insert into public.candidate_onboarding_steps(user_id,step,first_seen_at,last_seen_at,completed_at,error_count)
 values(candidate_id,step_id,now(),now(),case when event_type in ('welcomeComplete','videoComplete') then now() end,case when event_type='error' then 1 else 0 end)
 on conflict(user_id,step) do update set
 first_seen_at=coalesce(public.candidate_onboarding_steps.first_seen_at,excluded.first_seen_at),
 last_seen_at=excluded.last_seen_at,
 completed_at=coalesce(public.candidate_onboarding_steps.completed_at,excluded.completed_at),
 error_count=public.candidate_onboarding_steps.error_count+excluded.error_count;
end $$;
revoke all on function public.record_onboarding_step(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_onboarding_step(uuid,text,text) to service_role;
create schema if not exists onboarding_internal;
revoke all on schema onboarding_internal from public,anon,authenticated;
create or replace function onboarding_internal.capture_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); previous jsonb:='{}'::jsonb; s text; c text; completed boolean; before_complete boolean;
begin
 if tg_op='UPDATE' then previous:=to_jsonb(old); end if;
 for s,c in select * from (values
 ('resume','resume_path'),('photo','profile_photo_path'),('id_photos','identity_photos_uploaded_at'),('id_video','identity_video_uploaded_at'),
 ('identity','identity_completed_at'),('platform','platform_completed_at'),('contract','contract_accepted_at'),
 ('review','verification_status'),('career','career_survey_completed_at'),('preferences','preferences_completed_at'),('intro','intro_completed_at'),('recording','intro_path')
 ) as fields(step_id,column_id) loop
 if not (j ? c) then continue; end if;
 completed:=coalesce(j->>c,'')<>'';
 before_complete:=coalesce(previous->>c,'')<>'';
 if s='review' then
 completed:=(j->>c='verified' or coalesce((j->>'verification_bypass')::boolean,false));
 before_complete:=(previous->>c='verified' or coalesce((previous->>'verification_bypass')::boolean,false));
 elsif s='recording' then
 completed:=completed or coalesce(j->>'intro_skipped_at','')<>'';
 before_complete:=before_complete or coalesce(previous->>'intro_skipped_at','')<>'';
 end if;
 if completed is distinct from before_complete or (completed and j->>c is distinct from previous->>c) then
 insert into public.candidate_onboarding_steps(user_id,step,completed_at)
 values(new.user_id,s,case when completed then now() end)
 on conflict(user_id,step) do update set completed_at=excluded.completed_at;
 end if;
 end loop;
 return new;
exception when others then
 raise warning 'Onboarding telemetry could not be captured';
 return new;
end $$;
revoke all on function onboarding_internal.capture_completion() from public,anon,authenticated;
drop trigger if exists track_profile_onboarding on public.candidate_profiles;
create trigger track_profile_onboarding after insert or update on public.candidate_profiles for each row execute function onboarding_internal.capture_completion();
drop trigger if exists track_saved_onboarding on public.candidate_onboarding;
create trigger track_saved_onboarding after insert or update on public.candidate_onboarding for each row execute function onboarding_internal.capture_completion();
