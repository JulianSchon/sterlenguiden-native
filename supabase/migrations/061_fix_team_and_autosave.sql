-- 061: Två rättelser i Mitt företag. Går att köra flera gånger.
--
-- 1. Sparandet ("Inte sparat"): business_update_place läser places.image_history (de bilder platsen
--    haft, så de får användas igen), men kolumnen fanns inte längre i databasen. Den läggs tillbaka.
-- 2. Personal laddade aldrig: 060 skrev om business_team efter en äldre version, som letade efter
--    tabellen place_claims (heter place_requests sedan 054). Här är rätt version, med inbjudningar
--    via användarnamn som @namn.

alter table public.places add column if not exists image_history text[] not null default '{}';

create or replace function public.business_team(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return jsonb_build_object(
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', pr.display_name, 'username', pr.username, 'color', pr.circle_color,
        'role', m.role, 'since', m.created_at, 'me', m.user_id = auth.uid(),
        'permissions', case when m.role = 'owner' then null else m.permissions end
      ) order by (m.role = 'owner') desc, m.created_at), '[]'::jsonb)
      from public.place_members m left join public.profiles pr on pr.user_id = m.user_id
      where m.place_id = p_place_id
    ),
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', case when i.invited_username is not null then '@' || i.invited_username else i.email end,
        'role', i.role, 'created_at', i.created_at)
        order by i.created_at desc), '[]'::jsonb)
      from public.place_invites i
      where i.place_id = p_place_id and i.accepted_at is null and i.declined_at is null and i.expires_at > now()
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'name', pr.display_name, 'username', pr.username,
        'role_title', c.role_title, 'message', c.message, 'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.place_requests c left join public.profiles pr on pr.user_id = c.user_id
      where c.place_id = p_place_id and c.kind = 'join' and c.status = 'pending'
    ),
    'changes', (
      select coalesce(jsonb_agg(jsonb_build_object('what', q.what, 'at', q.created_at, 'name', q.display_name)
        order by q.created_at desc), '[]'::jsonb)
      from (
        select ch.what, ch.created_at, pr.display_name
        from public.place_changes ch left join public.profiles pr on pr.user_id = ch.user_id
        where ch.place_id = p_place_id
        order by ch.created_at desc limit 15
      ) q
    )
  );
end $$;
