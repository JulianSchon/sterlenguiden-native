-- Statistiken "Så hittade de er": fler källor (evenemang, Upptäck, nyheter, incheckning), så färre
-- hamnar under Övrigt. Kör i Supabase → SQL Editor. Går att köra flera gånger.

create or replace function public.track_place_event(p_place_id bigint, p_kind text, p_link text default null, p_source text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_link text := case when p_kind = 'link_click' and p_link in ('phone', 'website', 'book', 'instagram', 'facebook', 'email') then p_link end;
  v_source text := case when p_source in ('home', 'search', 'map', 'calendar', 'profile', 'category', 'lists', 'place', 'offers', 'story', 'friends', 'event', 'discover', 'news', 'checkin', 'other') then p_source end;
begin
  if v_uid is null or p_kind not in ('profile_view', 'link_click', 'navigation_click') then return; end if;
  if p_kind = 'link_click' and v_link is null then return; end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then return; end if;
  if p_kind = 'profile_view' and exists (
    select 1 from public.business_analytics
    where place_id = p_place_id and user_id = v_uid and event_type = 'profile_view' and created_at > now() - interval '30 minutes'
  ) then return; end if;
  if p_kind <> 'profile_view' and exists (
    select 1 from public.business_analytics
    where place_id = p_place_id and user_id = v_uid and event_type = p_kind and link_type is not distinct from v_link
      and created_at > now() - interval '10 seconds'
  ) then return; end if;
  if (select count(*) from public.business_analytics where user_id = v_uid and created_at > now() - interval '1 hour') >= 500 then return; end if;
  if not exists (select 1 from public.places where id = p_place_id) then return; end if;
  insert into public.business_analytics (place_id, event_type, link_type, user_id, source)
  values (p_place_id, p_kind, v_link, v_uid, case when p_kind = 'profile_view' then v_source end);
end $$;
