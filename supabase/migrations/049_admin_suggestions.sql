-- Admin: tipsen från "Saknas ditt smultronställe?" syns i appen (Inställningar → Admin), och
-- kan bockas av när de är klara. Räknas med i siffran på Admin-raden. Kör i Supabase → SQL Editor.
-- Går att köra flera gånger.

alter table public.place_suggestions add column if not exists created_at timestamptz not null default now();
alter table public.place_suggestions add column if not exists handled_at timestamptz;

-- Tipsen: de som väntar först, sedan de senaste klara (högst 300)
create or replace function public.admin_suggestions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by (x.handled_at is null) desc, x.created_at desc)
    from (
      select s.*, pr.display_name as user_name, u.email as user_email
      from public.place_suggestions s
      left join public.profiles pr on pr.user_id = s.user_id
      left join auth.users u on u.id = s.user_id
      order by s.created_at desc
      limit 300
    ) x
  ), '[]'::jsonb);
end $$;

-- Bocka av (eller ångra)
create or replace function public.admin_mark_suggestion(p_id text, p_done boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  update public.place_suggestions set handled_at = case when p_done then now() else null end where id::text = p_id;
end $$;

create or replace function public.business_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then return jsonb_build_object('places', '[]'::jsonb, 'invites', '[]'::jsonb, 'requests', '[]'::jsonb, 'admin', null); end if;
  select email into v_email from auth.users where id = v_uid;
  return jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'town', p.nearest_town, 'image_url', p.image_url, 'logo_url', p.logo_url,
        'categories', p.categories, 'role', m.role, 'terms_accepted_at', m.terms_accepted_at, 'joined_at', m.created_at,
        'requests', (select count(*) from public.place_claims c where c.place_id = p.id and c.kind = 'join' and c.status = 'pending')
      ) order by m.created_at)
      from public.place_members m join public.places p on p.id = m.place_id
      where m.user_id = v_uid
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'place_id', p.id, 'place_name', p.name, 'image_url', p.image_url, 'logo_url', p.logo_url,
        'role', i.role, 'invited_by', pr.display_name, 'created_at', i.created_at
      ) order by i.created_at desc)
      from public.place_invites i
      join public.places p on p.id = i.place_id
      left join public.profiles pr on pr.user_id = i.invited_by
      where v_email is not null and lower(i.email) = lower(v_email)
        and i.accepted_at is null and i.declined_at is null and i.expires_at > now()
        and not exists (select 1 from public.place_members m2 where m2.place_id = i.place_id and m2.user_id = v_uid)
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'status', c.status, 'place_id', c.place_id,
        'place_name', coalesce(p.name, c.new_place ->> 'name'), 'created_at', c.created_at
      ) order by c.created_at desc)
      from public.place_claims c left join public.places p on p.id = c.place_id
      where c.user_id = v_uid and (c.status = 'pending' or c.decided_at > now() - interval '14 days')
    ), '[]'::jsonb),
    'admin', case when public.is_app_admin()
      then (select count(*) from public.place_claims where status = 'pending' and kind in ('claim', 'new_place'))
         + (select count(*) from public.place_suggestions where handled_at is null)
      else null end
  );
end $$;

revoke execute on function public.admin_suggestions() from public, anon;
grant execute on function public.admin_suggestions() to authenticated;
revoke execute on function public.admin_mark_suggestion(text, boolean) from public, anon;
grant execute on function public.admin_mark_suggestion(text, boolean) to authenticated;
