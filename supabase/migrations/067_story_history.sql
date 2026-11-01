-- 067: Mitt företag › Stories visar alla stories företaget postat, inte bara senaste 30 dagarna
--
-- Ett företag som postat varje vecka i flera år får en lång lista, så den hämtas en bit i taget:
-- först alla stories som är ute nu och de 6 senaste gamla, sedan 12 åt gången ("Visa fler").
-- Svaret är { live: [...], old: [...], more: true/false }. p_before = den äldsta gamla storyn man
-- redan har (null = första hämtningen).
--
-- Visningarna räknas nu med ett index på story_views(story_id) — förut jämfördes id:n som text, så
-- varje story gick igenom hela tabellen.

create index if not exists story_views_story_idx on public.story_views (story_id);

-- En story som JSON, med visningar, enkätresultat och svar (anonyma). Bara för funktionen nedan.
create or replace function public.bp_story_json(s public.stories)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', s.id, 'image_url', s.image_url, 'caption', s.caption, 'created_at', s.created_at,
    'expires_at', s.expires_at, 'link', s.link, 'video_url', s.video_url, 'overlay_url', s.overlay_url,
    'interaction', s.interaction,
    'views', (select count(*) from public.story_views v where v.story_id = s.id),
    'votes', case when s.interaction ->> 'kind' = 'poll' then jsonb_build_array(
      (select count(*) from public.story_votes where story_id = s.id and option = 0),
      (select count(*) from public.story_votes where story_id = s.id and option = 1)) end,
    'answers', case when s.interaction ->> 'kind' = 'question' then coalesce((
      select jsonb_agg(q.answer order by q.created_at desc)
      from (select answer, created_at from public.story_answers where story_id = s.id order by created_at desc limit 100) q
    ), '[]'::jsonb) end
  )
$function$;
revoke execute on function public.bp_story_json(public.stories) from public, anon, authenticated;

drop function if exists public.business_stories_overview(bigint);

create or replace function public.business_stories_overview(
  p_place_id bigint,
  p_before timestamptz default null,
  p_limit int default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 6), 1), 50);
  v_old jsonb;
  v_oldest timestamptz;
  v_count int;
begin
  perform public.bp_require_member(p_place_id);

  select coalesce(jsonb_agg(public.bp_story_json(o) order by o.created_at desc), '[]'::jsonb), min(o.created_at), count(*)
    into v_old, v_oldest, v_count
  from (
    select * from public.stories s
    where s.place_id = p_place_id
      and s.expires_at is not null and s.expires_at <= now()
      and (p_before is null or s.created_at < p_before)
    order by s.created_at desc
    limit v_limit
  ) o;

  return jsonb_build_object(
    -- Det som är ute nu kommer bara med i första hämtningen
    'live', case when p_before is null then coalesce((
      select jsonb_agg(public.bp_story_json(s) order by s.created_at desc)
      from public.stories s
      where s.place_id = p_place_id and (s.expires_at is null or s.expires_at > now())
    ), '[]'::jsonb) else '[]'::jsonb end,
    'old', v_old,
    'more', v_count = v_limit and exists (
      select 1 from public.stories s
      where s.place_id = p_place_id and s.expires_at is not null and s.expires_at <= now() and s.created_at < v_oldest
    )
  );
end $function$;
revoke execute on function public.business_stories_overview(bigint, timestamptz, int) from public, anon;
grant execute on function public.business_stories_overview(bigint, timestamptz, int) to authenticated;
