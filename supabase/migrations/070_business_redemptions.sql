-- 070: Inlösta erbjudanden i Mitt företag
--
-- Varje gång en medlem aktiverar ett av platsens erbjudanden syns det för dem som sköter platsen:
-- tid, medlemmens namn och vilket erbjudande. Så kan kassan eller receptionen dubbelkolla i
-- efterhand (eller medan det händer) att en aktivering är äkta. Alla som hör till platsen ser
-- listan, även personal utan rätt att skapa erbjudanden — det är de som står i kassan.

create or replace function public.business_redemptions(p_place_id bigint, p_offset int default 0, p_limit int default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_more boolean;
  v_today int;
begin
  perform public.bp_require_member(p_place_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'at', x.activated_at, 'name', x.name, 'offer', x.title, 'offer_id', x.offer_id
         ) order by x.activated_at desc), '[]'::jsonb)
    into v_items
  from (
    select r.id, r.activated_at, o.title, o.id as offer_id,
           nullif(btrim(coalesce(p.display_name, p.username, '')), '') as name
    from public.offer_redemptions r
    join public.offers o on o.id = r.offer_id
    left join public.profiles p on p.user_id = r.user_id
    where o.place_id = p_place_id
    order by r.activated_at desc
    offset v_offset limit v_limit
  ) x;

  select exists (
    select 1 from public.offer_redemptions r join public.offers o on o.id = r.offer_id
    where o.place_id = p_place_id
    order by r.activated_at desc offset v_offset + v_limit limit 1
  ) into v_more;

  select count(*) into v_today
  from public.offer_redemptions r join public.offers o on o.id = r.offer_id
  where o.place_id = p_place_id
    and (r.activated_at at time zone 'Europe/Stockholm')::date = (now() at time zone 'Europe/Stockholm')::date;

  return jsonb_build_object('items', v_items, 'more', v_more, 'today', v_today);
end $$;

revoke execute on function public.business_redemptions(bigint, int, int) from public, anon;
grant execute on function public.business_redemptions(bigint, int, int) to authenticated;
