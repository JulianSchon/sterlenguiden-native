-- 062: Stories med enkät, fråga och video. Går att köra flera gånger.
--
-- Enkät och fråga ritas inte in i bilden. De sparas i stories.interaction (vad det är och var på
-- bilden, i andelar) och visas levande i storyn, så gästen kan rösta eller svara och se resultatet.
--   enkät: { kind: "poll", question, options: [a, b], x, y, w, h, r }
--   fråga: { kind: "question", prompt, x, y, w, h, r }
-- Rösterna och svaren läses bara via funktionerna nedan. Företaget ser antal röster och svaren,
-- aldrig vem som svarat.
--
-- Video: stories.video_url är filmen, stories.overlay_url det genomskinliga lagret med text och
-- klistermärken ovanpå, och image_url som vanligt en stillbild (omslaget i listor och ringar).
-- Bucketen place-media tar nu emot video (mp4/mov) upp till 50 MB.

alter table public.stories add column if not exists video_url text;
alter table public.stories add column if not exists overlay_url text;
alter table public.stories add column if not exists interaction jsonb;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
where id = 'place-media';

create table if not exists public.story_votes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option smallint not null check (option in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create table if not exists public.story_answers (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists story_answers_story_idx on public.story_answers (story_id, created_at desc);
alter table public.story_votes enable row level security;
alter table public.story_answers enable row level security;
comment on table public.story_votes is 'Röster på enkäter i stories (en per person och story). Läses via story_poll och business_stories_overview.';
comment on table public.story_answers is 'Svar på frågor i stories. Företaget ser svaren men inte vem som svarat.';

/** Rutan på bilden, i andelar 0–1 (och vridningen i radianer) */
create or replace function public.bp_story_rect(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'x', least(1, greatest(0, coalesce((p ->> 'x')::numeric, 0))),
    'y', least(1, greatest(0, coalesce((p ->> 'y')::numeric, 0))),
    'w', least(1, greatest(0, coalesce((p ->> 'w')::numeric, 0))),
    'h', least(1, greatest(0, coalesce((p ->> 'h')::numeric, 0))),
    'r', least(7, greatest(-7, coalesce((p ->> 'r')::numeric, 0))))
$$;

drop function if exists public.business_post_story(bigint, text, text, jsonb);
create or replace function public.business_post_story(
  p_place_id bigint, p_image_url text, p_caption text default null, p_link jsonb default null,
  p_video_url text default null, p_overlay_url text default null, p_interaction jsonb default null
)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_prefix text := public.bp_media_prefix(p_place_id);
  v_link jsonb;
  v_inter jsonb;
  v_id uuid;
  v_kind text;
  v_ok boolean := false;
  v_q text;
  v_a text;
  v_b text;
begin
  perform public.bp_require_member(p_place_id);
  perform public.bp_require_permission(p_place_id, 'stories');
  -- Stories är alltid nya filer i platsens egen mapp
  if p_image_url is null or not starts_with(p_image_url, v_prefix) or not public.bp_image_ok(p_place_id, p_image_url) then
    raise exception 'invalid:image_url' using errcode = 'P0001';
  end if;
  if p_video_url is not null and not starts_with(p_video_url, v_prefix) then raise exception 'invalid:video_url' using errcode = 'P0001'; end if;
  if p_overlay_url is not null and not starts_with(p_overlay_url, v_prefix) then raise exception 'invalid:overlay_url' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_caption, '')) > 300 then raise exception 'too_long:caption' using errcode = 'P0001'; end if;

  if p_link is not null and jsonb_typeof(p_link) = 'object' then
    v_kind := p_link ->> 'kind';
    -- Jämförs som text: ett id i fel form ska ge "fel länk", inte ett tekniskt fel
    if v_kind = 'offer' then
      v_ok := exists (select 1 from public.offers where id::text = p_link ->> 'id' and place_id = p_place_id);
    elsif v_kind = 'event' then
      v_ok := exists (select 1 from public.events where id::text = p_link ->> 'id' and place_id = p_place_id);
    end if;
    if not v_ok then raise exception 'invalid:link' using errcode = 'P0001'; end if;
    v_link := jsonb_build_object('kind', v_kind, 'id', p_link ->> 'id') || public.bp_story_rect(p_link);
  end if;

  if p_interaction is not null and jsonb_typeof(p_interaction) = 'object' then
    v_kind := p_interaction ->> 'kind';
    if v_kind = 'poll' then
      v_q := btrim(coalesce(p_interaction ->> 'question', ''));
      v_a := btrim(coalesce(p_interaction -> 'options' ->> 0, ''));
      v_b := btrim(coalesce(p_interaction -> 'options' ->> 1, ''));
      if char_length(v_q) > 80 or char_length(v_a) not between 1 and 24 or char_length(v_b) not between 1 and 24 then
        raise exception 'invalid:interaction' using errcode = 'P0001';
      end if;
      v_inter := jsonb_build_object('kind', 'poll', 'question', v_q, 'options', jsonb_build_array(v_a, v_b));
    elsif v_kind = 'question' then
      v_q := btrim(coalesce(p_interaction ->> 'prompt', ''));
      if char_length(v_q) not between 1 and 80 then raise exception 'invalid:interaction' using errcode = 'P0001'; end if;
      v_inter := jsonb_build_object('kind', 'question', 'prompt', v_q);
    else
      raise exception 'invalid:interaction' using errcode = 'P0001';
    end if;
    v_inter := v_inter || public.bp_story_rect(p_interaction);
  end if;

  if (select count(*) from public.stories where place_id = p_place_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'too_many:stories' using errcode = 'P0001';
  end if;
  insert into public.stories (user_id, place_id, image_url, caption, expires_at, link, video_url, overlay_url, interaction)
  values (auth.uid(), p_place_id, p_image_url, v_caption, now() + interval '24 hours', v_link, p_video_url, p_overlay_url, v_inter)
  returning id into v_id;
  perform public.bp_log(p_place_id, 'story');
  return v_id;
end $$;

-- Enkätens resultat för en story: antal per alternativ och vad man själv röstat (null = inte än)
create or replace function public.story_poll(p_story_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counts', jsonb_build_array(
      (select count(*) from public.story_votes where story_id = p_story_id and option = 0),
      (select count(*) from public.story_votes where story_id = p_story_id and option = 1)),
    'mine', (select option from public.story_votes where story_id = p_story_id and user_id = auth.uid()))
$$;

-- Rösta (en gång per story; går inte att ändra, som på Instagram)
create or replace function public.story_vote(p_story_id uuid, p_option int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_option not in (0, 1) or not exists (
    select 1 from public.stories
    where id = p_story_id and interaction ->> 'kind' = 'poll' and (expires_at is null or expires_at > now())
  ) then
    raise exception 'invalid:vote' using errcode = 'P0001';
  end if;
  insert into public.story_votes (story_id, user_id, option) values (p_story_id, auth.uid(), p_option)
  on conflict (story_id, user_id) do nothing;
  return public.story_poll(p_story_id);
end $$;

-- Svara på en fråga (högst fem svar per person och story)
create or replace function public.story_answer(p_story_id uuid, p_answer text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_text text := btrim(coalesce(p_answer, ''));
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if char_length(v_text) not between 1 and 300 then raise exception 'invalid:answer' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.stories
    where id = p_story_id and interaction ->> 'kind' = 'question' and (expires_at is null or expires_at > now())
  ) then
    raise exception 'invalid:answer' using errcode = 'P0001';
  end if;
  if (select count(*) from public.story_answers where story_id = p_story_id and user_id = auth.uid()) >= 5 then
    raise exception 'too_many:answers' using errcode = 'P0001';
  end if;
  insert into public.story_answers (story_id, user_id, answer) values (p_story_id, auth.uid(), v_text);
end $$;

-- Företagets stories, nu med video, enkätresultat och svaren (utan vem som svarat)
create or replace function public.business_stories_overview(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'image_url', s.image_url, 'caption', s.caption, 'created_at', s.created_at,
      'expires_at', s.expires_at, 'link', s.link, 'video_url', s.video_url, 'overlay_url', s.overlay_url,
      'interaction', s.interaction,
      'views', (select count(*) from public.story_views v where v.story_id::text = s.id::text),
      'votes', case when s.interaction ->> 'kind' = 'poll' then jsonb_build_array(
        (select count(*) from public.story_votes where story_id = s.id and option = 0),
        (select count(*) from public.story_votes where story_id = s.id and option = 1)) end,
      'answers', case when s.interaction ->> 'kind' = 'question' then coalesce((
        select jsonb_agg(q.answer order by q.created_at desc)
        from (select answer, created_at from public.story_answers where story_id = s.id order by created_at desc limit 100) q
      ), '[]'::jsonb) end
    ) order by s.created_at desc)
    from public.stories s
    where s.place_id = p_place_id and s.created_at > now() - interval '30 days'
  ), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.business_post_story(bigint, text, text, jsonb, text, text, jsonb)',
    'public.story_poll(uuid)',
    'public.story_vote(uuid, int)',
    'public.story_answer(uuid, text)',
    'public.business_stories_overview(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.bp_story_rect(jsonb) from public, anon, authenticated;
end $$;
