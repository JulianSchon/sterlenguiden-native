-- 068: Avslutade erbjudanden hämtas en bit i taget
--
-- business_offers hämtade ALLA erbjudanden företaget någonsin haft. Nu ger den bara de som är igång
-- eller pausade (det Mitt företag visar för det mesta), och de avslutade hämtas för sig, 6 först
-- och sedan 12 åt gången ("Visa fler") — så listan inte växer för varje år företaget finns.

create or replace function public.business_offers(p_place_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.bp_require_member(p_place_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offer', to_jsonb(o),
      'redemptions', (select count(*) from public.offer_redemptions r where r.offer_id = o.id),
      'people', (select count(distinct r.user_id) from public.offer_redemptions r where r.offer_id = o.id),
      'recent', (select count(*) from public.offer_redemptions r where r.offer_id = o.id and r.activated_at > now() - interval '30 days')
    ) order by o.created_at desc)
    from public.offers o
    where o.place_id = p_place_id and (o.expires_at is null or o.expires_at > now())
  ), '[]'::jsonb);
end $function$;

-- De avslutade, senast avslutade först: { items: [...], more: true/false }
create or replace function public.business_offers_ended(p_place_id bigint, p_offset int default 0, p_limit int default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 6), 1), 50);
  v_items jsonb;
  v_count int;
begin
  perform public.bp_require_member(p_place_id);
  select coalesce(jsonb_agg(x.item order by x.expires_at desc, x.created_at desc) filter (where x.n <= v_limit), '[]'::jsonb),
         count(*)
    into v_items, v_count
  from (
    select o.expires_at, o.created_at,
           row_number() over (order by o.expires_at desc, o.created_at desc) as n,
           jsonb_build_object(
             'offer', to_jsonb(o),
             'redemptions', (select count(*) from public.offer_redemptions r where r.offer_id = o.id),
             'people', (select count(distinct r.user_id) from public.offer_redemptions r where r.offer_id = o.id),
             'recent', 0
           ) as item
    from public.offers o
    where o.place_id = p_place_id and o.expires_at is not null and o.expires_at <= now()
    order by o.expires_at desc, o.created_at desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit v_limit + 1
  ) x;
  return jsonb_build_object('items', v_items, 'more', v_count > v_limit);
end $function$;
revoke execute on function public.business_offers_ended(bigint, int, int) from public, anon;
grant execute on function public.business_offers_ended(bigint, int, int) to authenticated;
