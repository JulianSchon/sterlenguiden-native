-- Företagsportalen. Kör i Supabase → SQL Editor. Går att köra flera gånger.
--
-- Vad det här gör, i korthet:
--   1. Vem sköter vilken plats: en riktig koppling mellan konto och plats (place_members), med
--      rollerna Ägare och Personal. Inget hänger längre på att namn råkar stämma.
--   2. "Är det här ditt företag?": man får en kod till platsens egen e-post (bara den som driver
--      företaget kan läsa den), eller skickar en förfrågan som du godkänner i appen. Hårda gränser
--      så ingen kan skicka mängder av mejl: högst 3 koder per företag och dygn, högst 5 per person.
--   3. Allt ett företag ändrar går genom databasens egna funktioner, som kollar att man sköter
--      just den platsen och att det man skriver är rimligt. Appen kan inte längre skriva direkt i
--      platser, erbjudanden, evenemang eller berättelser — då går det inte att fuska.
--   4. Erbjudanden: ett erbjudande som någon redan löst in kan inte skrivas om (bara förlängas,
--      pausas eller avslutas). Man kan inte lösa in sitt eget företags erbjudanden, och bara den som
--      har ett giltigt Österlenpass kan lösa in alls.
--   5. Statistik: appen räknar visningar, klick och vägbeskrivningar. Företaget ser bara antal,
--      aldrig vem. Ålder och hemort visas först när minst 20 personer tittat, och grupper med färre
--      än 5 personer visas inte alls.
--   6. Mejl skickas via Resend när du lagt in nyckeln (se längst ner). Tills dess fungerar allt
--      utom koden till företagets e-post — då skickas en förfrågan till dig i stället.

-- ─── 0. Hjälpare ────────────────────────────────────────────────────────────

-- Text ur ett jsonb-fält: trimmad, null om tom, fel om den är för lång
create or replace function public.bp_text(p jsonb, p_key text, p_max int)
returns text language plpgsql immutable as $$
declare v text;
begin
  if p is null or not (p ? p_key) or jsonb_typeof(p -> p_key) = 'null' then return null; end if;
  v := btrim(p ->> p_key);
  if v = '' then return null; end if;
  if char_length(v) > p_max then raise exception 'too_long:%', p_key using errcode = 'P0001'; end if;
  return v;
end $$;

-- En webbadress (med eller utan https://). Inga mellanslag, inga konstiga scheman.
create or replace function public.bp_url(p jsonb, p_key text)
returns text language plpgsql immutable as $$
declare v text := public.bp_text(p, p_key, 300);
begin
  if v is null then return null; end if;
  if v ~ '\s' or v !~* '^(https?://)?([a-z0-9åäöæøü-]+\.)+[a-z]{2,}(:[0-9]{2,5})?([/?#].*)?$' then
    raise exception 'invalid:%', p_key using errcode = 'P0001';
  end if;
  return v;
end $$;

create or replace function public.bp_is_email(p text)
returns boolean language sql immutable as $$
  select p is not null and char_length(p) <= 200 and p ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
$$;

create or replace function public.bp_is_phone(p text)
returns boolean language sql immutable as $$
  select p is not null and p ~ '^\+?[0-9][0-9 ()-]{4,28}$'
$$;

-- Text som ska in i ett mejl
create or replace function public.bp_html(p text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- Platsens bilder: image_url är flera adresser skilda med komma (Wix-adresser har komman i sig,
-- så det delas bara vid komman som följs av en ny adress — samma regel som i appen)
create or replace function public.bp_images(p text)
returns text[] language sql immutable as $$
  select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}')
  from regexp_split_to_table(coalesce(p, ''), ',(?=\s*https?://)') x
$$;

-- Bilderna platsen haft (de senaste 40), så en borttagen bild kan läggas tillbaka. Läggs till här
-- eftersom bp_image_ok nedan läser den.
alter table public.places add column if not exists image_history text[] not null default '{}';

-- Var företagens egna bilder ligger: bucketen place-media, i en mapp per plats
create or replace function public.bp_media_prefix(p_place_id bigint)
returns text language sql immutable as $$
  select 'https://hnaaalewgkpqcylaaidj.supabase.co/storage/v1/object/public/place-media/' || p_place_id::text || '/'
$$;

-- En bild får användas om den ligger i platsens egen mapp, eller är (eller har varit) en av
-- platsens bilder — så Ångra fungerar även för de gamla bilderna från innan portalen fanns
create or replace function public.bp_image_ok(p_place_id bigint, p_url text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_url is not null and (
    (starts_with(p_url, public.bp_media_prefix(p_place_id))
      and substr(p_url, char_length(public.bp_media_prefix(p_place_id)) + 1) ~ '^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    or exists (
      select 1 from public.places pl
      where pl.id = p_place_id
        and (p_url = any(public.bp_images(pl.image_url)) or p_url = pl.logo_url or p_url = any(coalesce(pl.image_history, '{}')))
    )
  )
$$;

-- Minst 18 år (äldre konton utan födelsedag släpps igenom)
create or replace function public.bp_adult(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.birth_date is not null then p.birth_date <= (current_date - interval '18 years')::date
      when p.birth_year is not null then p.birth_year <= extract(year from current_date)::int - 18
      else true
    end
    from public.profiles p where p.user_id = p_uid
  ), true)
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

-- Ingen kan ge sig själv en roll (admin) från appen
alter table public.user_roles enable row level security;
revoke insert, update, delete, truncate on public.user_roles from anon, authenticated;

-- ─── 1. Vem sköter vilken plats ─────────────────────────────────────────────

create table if not exists public.place_members (
  place_id          bigint not null references public.places(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              text not null default 'staff' check (role in ('owner', 'staff')),
  invited_by        uuid references auth.users(id) on delete set null,
  terms_accepted_at timestamptz,
  created_at        timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index if not exists place_members_user_idx on public.place_members (user_id);
alter table public.place_members enable row level security;
revoke all on public.place_members from anon, authenticated;

create or replace function public.is_place_member(p_place_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.place_members where place_id = p_place_id and user_id = auth.uid())
$$;

-- Kastar ett fel om man inte sköter platsen (eller inte är ägare när det krävs). Returnerar rollen.
create or replace function public.bp_require_member(p_place_id bigint, p_owner boolean default false)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select role into v_role from public.place_members where place_id = p_place_id and user_id = auth.uid();
  if v_role is null then raise exception 'not_member' using errcode = 'P0001'; end if;
  if p_owner and v_role <> 'owner' then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return v_role;
end $$;

-- ─── 2. Förfrågningar, koder, inbjudningar och vem som ändrat vad ───────────

create table if not exists public.place_claims (
  id         uuid primary key default gen_random_uuid(),
  -- claim = ta över en plats utan ägare (du godkänner), join = gå med där det finns en ägare
  -- (ägaren godkänner), new_place = företaget finns inte i appen än (du godkänner)
  kind       text not null check (kind in ('claim', 'join', 'new_place')),
  place_id   bigint references public.places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  role_title text check (char_length(role_title) <= 60),
  phone      text check (char_length(phone) <= 30),
  message    text check (char_length(message) <= 600),
  new_place  jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create index if not exists place_claims_status_idx on public.place_claims (status, created_at desc);
create index if not exists place_claims_place_idx on public.place_claims (place_id, status);
create index if not exists place_claims_user_idx on public.place_claims (user_id, created_at desc);
alter table public.place_claims enable row level security;
revoke all on public.place_claims from anon, authenticated;

create table if not exists public.place_claim_codes (
  id         uuid primary key default gen_random_uuid(),
  place_id   bigint not null references public.places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Bara ett avtryck av koden sparas, aldrig koden själv
  code_hash  text not null,
  sent_to    text not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists place_claim_codes_place_idx on public.place_claim_codes (place_id, created_at desc);
create index if not exists place_claim_codes_user_idx on public.place_claim_codes (user_id, created_at desc);
alter table public.place_claim_codes enable row level security;
revoke all on public.place_claim_codes from anon, authenticated;

create table if not exists public.place_invites (
  id          uuid primary key default gen_random_uuid(),
  place_id    bigint not null references public.places(id) on delete cascade,
  email       text not null check (char_length(email) <= 200),
  role        text not null default 'staff' check (role in ('owner', 'staff')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  declined_at timestamptz
);
create index if not exists place_invites_email_idx on public.place_invites (lower(email));
create index if not exists place_invites_place_idx on public.place_invites (place_id);
alter table public.place_invites enable row level security;
revoke all on public.place_invites from anon, authenticated;

create table if not exists public.place_changes (
  id         bigserial primary key,
  place_id   bigint not null references public.places(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  what       text not null,
  created_at timestamptz not null default now()
);
create index if not exists place_changes_place_idx on public.place_changes (place_id, created_at desc);
alter table public.place_changes enable row level security;
revoke all on public.place_changes from anon, authenticated;

-- Samma sak ändrad flera gånger inom tio minuter (allt sparas medan man skriver) blir en rad
create or replace function public.bp_log(p_place_id bigint, p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from public.place_changes
  where place_id = p_place_id and user_id = auth.uid() and what = p_what and created_at > now() - interval '10 minutes'
  order by created_at desc limit 1;
  if v_id is not null then
    update public.place_changes set created_at = now() where id = v_id;
  else
    insert into public.place_changes (place_id, user_id, what) values (p_place_id, auth.uid(), p_what);
  end if;
end $$;

-- ─── 3. Platsen ─────────────────────────────────────────────────────────────

-- Tillfälliga ändringar av öppettiderna: stängt idag, semester, helgdagar, sommartider …
-- [{ id, from, to, label, closed, hours, week, yearly }] — se src/lib/openingHours.ts
alter table public.places add column if not exists hours_exceptions jsonb not null default '[]'::jsonb;
-- Vad stället serverar (fisk, husmanskost, pizza …), så sökningen hittar dem
alter table public.places add column if not exists tastes text[] not null default '{}';
-- "Är det här ditt företag?" längst ner på platssidan döljs när någon tagit hand om platsen
alter table public.places add column if not exists claim_link_hidden boolean not null default false;

-- När den sista personen lämnat platsen kan någon annan ta över den igen
create or replace function public.place_members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.place_members where place_id = old.place_id) then
    update public.places set claim_link_hidden = false where id = old.place_id;
  end if;
  return null;
end $$;
drop trigger if exists place_members_after_delete on public.place_members;
create trigger place_members_after_delete after delete on public.place_members
  for each row execute function public.place_members_after_delete();

-- Undantagen kontrolleras och städas: gamla (som inte återkommer varje år) tas bort
create or replace function public.bp_clean_exceptions(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_from date;
  v_to date;
  v_n int := 0;
  v_key text;
  v_val text;
  v_days text[] := array['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_yearly boolean;
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'::jsonb; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'invalid:hours_exceptions' using errcode = 'P0001'; end if;
  for v_item in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid:hours_exceptions' using errcode = 'P0001'; end if;
    v_from := (v_item ->> 'from')::date;
    v_to := coalesce((v_item ->> 'to')::date, v_from);
    v_yearly := coalesce((v_item ->> 'yearly')::boolean, false);
    if v_from is null or v_to < v_from or v_to - v_from > 366 then
      raise exception 'invalid:hours_exceptions' using errcode = 'P0001';
    end if;
    if not v_yearly and v_to < v_today - 1 then continue; end if;
    v_n := v_n + 1;
    if v_n > 40 then raise exception 'too_many:hours_exceptions' using errcode = 'P0001'; end if;
    if char_length(coalesce(v_item ->> 'label', '')) > 40 or char_length(coalesce(v_item ->> 'hours', '')) > 60 then
      raise exception 'invalid:hours_exceptions' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_item -> 'week') = 'object' then
      for v_key, v_val in select key, value from jsonb_each_text(v_item -> 'week') loop
        if not (v_key = any(v_days)) or char_length(coalesce(v_val, '')) > 60 then
          raise exception 'invalid:hours_exceptions' using errcode = 'P0001';
        end if;
      end loop;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', left(coalesce(nullif(v_item ->> 'id', ''), gen_random_uuid()::text), 40),
      'from', v_from,
      'to', v_to,
      'label', nullif(btrim(coalesce(v_item ->> 'label', '')), ''),
      'closed', coalesce((v_item ->> 'closed')::boolean, false),
      'hours', nullif(btrim(coalesce(v_item ->> 'hours', '')), ''),
      'week', case when jsonb_typeof(v_item -> 'week') = 'object' then v_item -> 'week' else null end,
      'yearly', v_yearly
    ));
  end loop;
  return v_out;
end $$;

-- Ändra sin egen plats. Bara fälten nedan, och bara rimliga värden. Returnerar det som sparats.
create or replace function public.business_update_place(p_place_id bigint, p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.bp_require_member(p_place_id);
  v_cur record;
  v_key text;
  v_days text[] := array['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
  v_amen text[] := array['parking', 'wifi', 'pets', 'outdoor', 'accessible', 'family', 'vegetarian', 'ev', 'booking'];
  v_tastes_all text[] := array['fish', 'homestyle', 'pizza', 'burger', 'asian', 'meat', 'sweets', 'icecream', 'wine', 'beer', 'cheese', 'apples', 'chocolate'];
  v_name text; v_short text; v_desc text; v_phone text; v_email text; v_web text; v_book text; v_fb text; v_ig text; v_stop text;
  v_hours jsonb; v_exc jsonb; v_amenities jsonb; v_cats text; v_sub text; v_tastes text[]; v_images text; v_logo text;
  v_price int; v_hidden boolean;
  v_url text;
  v_list text[];
  v_history text[];
  v_groups text[] := '{}';
  v_out jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid:patch' using errcode = 'P0001'; end if;
  select * into v_cur from public.places where id = p_place_id for update;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(array['name', 'short_description', 'description', 'phone', 'email', 'website_url', 'book_url',
        'facebook_url', 'instagram_url', 'transit_stop_name', 'opening_hours', 'hours_exceptions', 'amenities',
        'categories', 'sub_category', 'tastes', 'image_url', 'logo_url', 'price_level', 'claim_link_hidden'])) then
      raise exception 'invalid:%', v_key using errcode = 'P0001';
    end if;
    v_groups := v_groups || case
      when v_key in ('opening_hours') then 'hours'
      when v_key in ('hours_exceptions') then 'exceptions'
      when v_key in ('name', 'short_description', 'description') then 'about'
      when v_key in ('phone', 'email', 'website_url', 'book_url', 'facebook_url', 'instagram_url', 'transit_stop_name') then 'contact'
      when v_key in ('image_url', 'logo_url') then 'photos'
      when v_key in ('categories', 'sub_category', 'tastes', 'price_level') then 'categories'
      when v_key = 'amenities' then 'amenities'
      else 'settings'
    end;
  end loop;

  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch ->> 'name', ''));
    if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid:name' using errcode = 'P0001'; end if;
  end if;
  v_short := public.bp_text(p_patch, 'short_description', 200);
  v_desc := public.bp_text(p_patch, 'description', 4000);
  v_phone := public.bp_text(p_patch, 'phone', 30);
  if v_phone is not null and not public.bp_is_phone(v_phone) then raise exception 'invalid:phone' using errcode = 'P0001'; end if;
  v_email := public.bp_text(p_patch, 'email', 200);
  if v_email is not null and not public.bp_is_email(v_email) then raise exception 'invalid:email' using errcode = 'P0001'; end if;
  v_web := public.bp_url(p_patch, 'website_url');
  v_book := public.bp_url(p_patch, 'book_url');
  v_fb := public.bp_url(p_patch, 'facebook_url');
  v_ig := public.bp_url(p_patch, 'instagram_url');
  v_stop := public.bp_text(p_patch, 'transit_stop_name', 80);

  if p_patch ? 'opening_hours' and jsonb_typeof(p_patch -> 'opening_hours') <> 'null' then
    if jsonb_typeof(p_patch -> 'opening_hours') <> 'object' then raise exception 'invalid:opening_hours' using errcode = 'P0001'; end if;
    if exists (
      select 1 from jsonb_each(p_patch -> 'opening_hours') e
      where not (e.key = any(v_days)) or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 60
    ) then
      raise exception 'invalid:opening_hours' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_object_agg(e.key, btrim(e.value)), '{}'::jsonb) into v_hours
    from jsonb_each_text(p_patch -> 'opening_hours') e where btrim(e.value) <> '';
    if v_hours = '{}'::jsonb then v_hours := null; end if;
  end if;

  if p_patch ? 'hours_exceptions' then v_exc := public.bp_clean_exceptions(p_patch -> 'hours_exceptions'); end if;

  if p_patch ? 'amenities' then
    if jsonb_typeof(p_patch -> 'amenities') <> 'object' or exists (
      select 1 from jsonb_each(p_patch -> 'amenities') e
      where not (e.key = any(v_amen)) or jsonb_typeof(e.value) <> 'boolean'
    ) then
      raise exception 'invalid:amenities' using errcode = 'P0001';
    end if;
    v_amenities := p_patch -> 'amenities';
  end if;

  v_cats := public.bp_text(p_patch, 'categories', 200);
  v_sub := public.bp_text(p_patch, 'sub_category', 300);

  if p_patch ? 'tastes' then
    if jsonb_typeof(p_patch -> 'tastes') <> 'array' then raise exception 'invalid:tastes' using errcode = 'P0001'; end if;
    select coalesce(array_agg(distinct x), '{}') into v_tastes from jsonb_array_elements_text(p_patch -> 'tastes') x;
    if not (v_tastes <@ v_tastes_all) then raise exception 'invalid:tastes' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'image_url' then
    if jsonb_typeof(p_patch -> 'image_url') <> 'array' then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
    select coalesce(array_agg(btrim(x) order by n), '{}') into v_list
    from jsonb_array_elements_text(p_patch -> 'image_url') with ordinality as t(x, n) where btrim(x) <> '';
    if cardinality(v_list) > 10 then raise exception 'too_many:image_url' using errcode = 'P0001'; end if;
    foreach v_url in array v_list loop
      if not public.bp_image_ok(p_place_id, v_url) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
    end loop;
    v_images := nullif(array_to_string(v_list, ','), '');
  end if;

  -- Bilder som tas bort (och en utbytt logga) sparas i historiken, så Ångra kan lägga tillbaka dem
  v_history := coalesce(v_cur.image_history, '{}');
  if p_patch ? 'image_url' then
    v_history := v_history || array(select x from unnest(public.bp_images(v_cur.image_url)) x where not (x = any(v_list)));
  end if;
  if p_patch ? 'logo_url' and v_cur.logo_url is not null and v_cur.logo_url is distinct from v_logo then
    v_history := v_history || v_cur.logo_url;
  end if;
  if cardinality(v_history) > 40 then v_history := v_history[cardinality(v_history) - 39:]; end if;

  if p_patch ? 'logo_url' then
    v_logo := nullif(btrim(coalesce(p_patch ->> 'logo_url', '')), '');
    if v_logo is not null and not public.bp_image_ok(p_place_id, v_logo) then raise exception 'invalid:logo_url' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'price_level' and jsonb_typeof(p_patch -> 'price_level') <> 'null' then
    v_price := (p_patch ->> 'price_level')::int;
    if v_price < 1 or v_price > 4 then raise exception 'invalid:price_level' using errcode = 'P0001'; end if;
  end if;

  if p_patch ? 'claim_link_hidden' then
    if v_role <> 'owner' then raise exception 'not_owner' using errcode = 'P0001'; end if;
    v_hidden := coalesce((p_patch ->> 'claim_link_hidden')::boolean, false);
  end if;

  update public.places set
    name              = case when p_patch ? 'name' then v_name else name end,
    short_description = case when p_patch ? 'short_description' then v_short else short_description end,
    description       = case when p_patch ? 'description' then v_desc else description end,
    phone             = case when p_patch ? 'phone' then v_phone else phone end,
    email             = case when p_patch ? 'email' then v_email else email end,
    website_url       = case when p_patch ? 'website_url' then v_web else website_url end,
    book_url          = case when p_patch ? 'book_url' then v_book else book_url end,
    facebook_url      = case when p_patch ? 'facebook_url' then v_fb else facebook_url end,
    instagram_url     = case when p_patch ? 'instagram_url' then v_ig else instagram_url end,
    transit_stop_name = case when p_patch ? 'transit_stop_name' then v_stop else transit_stop_name end,
    opening_hours     = case when p_patch ? 'opening_hours' then v_hours else opening_hours end,
    hours_exceptions  = case when p_patch ? 'hours_exceptions' then v_exc else hours_exceptions end,
    amenities         = case when p_patch ? 'amenities' then v_amenities else amenities end,
    categories        = case when p_patch ? 'categories' then v_cats else categories end,
    sub_category      = case when p_patch ? 'sub_category' then v_sub else sub_category end,
    tastes            = case when p_patch ? 'tastes' then v_tastes else tastes end,
    image_url         = case when p_patch ? 'image_url' then v_images else image_url end,
    logo_url          = case when p_patch ? 'logo_url' then v_logo else logo_url end,
    price_level       = case when p_patch ? 'price_level' then v_price else price_level end,
    claim_link_hidden = case when p_patch ? 'claim_link_hidden' then v_hidden else claim_link_hidden end,
    image_history     = v_history
  where id = p_place_id;

  select array_agg(distinct g) into v_groups from unnest(v_groups) g;
  if v_groups is not null then
    for v_key in select unnest(v_groups) loop perform public.bp_log(p_place_id, v_key); end loop;
  end if;

  select to_jsonb(x) into v_out from (
    select id, name, short_description, description, phone, email, website_url, book_url, facebook_url, instagram_url,
           transit_stop_name, opening_hours, hours_exceptions, amenities, categories, sub_category, tastes, image_url,
           logo_url, price_level, claim_link_hidden, info_updated_at
    from public.places where id = p_place_id
  ) x;
  return v_out;
end $$;

-- ─── 4. Mejl ────────────────────────────────────────────────────────────────
-- Skickas via Resend (resend.com) med tillägget pg_net. Nyckeln ligger i Supabase Vault och kan
-- aldrig läsas av appen. Saknas nyckeln skickas inga mejl, och appen vet om det.

create extension if not exists pg_net with schema extensions;

create or replace function public.app_email_key()
returns text language plpgsql stable security definer set search_path = public as $$
declare v_key text;
begin
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then
    v_key := null;
  end;
  return nullif(btrim(coalesce(v_key, '')), '');
end $$;

create or replace function public.app_email_ready()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_email_key() is not null
$$;

-- p_body är färdig html — allt som kommer från en användare ska ha gått genom bp_html först
create or replace function public.send_app_email(p_to text, p_subject text, p_heading text, p_body text, p_code text default null)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text := public.app_email_key();
  v_html text;
begin
  if v_key is null or not public.bp_is_email(p_to) then return false; end if;
  v_html :=
    '<!doctype html><html><body style="margin:0;padding:0;background:#F4F0E6;font-family:Helvetica,Arial,sans-serif;color:#1D1B16">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px"><tr><td style="padding:32px 28px">'
    || '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8A6A1F;font-weight:bold">Österlenappen</div>'
    || '<h1 style="font-size:22px;line-height:28px;margin:14px 0 12px;color:#1D1B16">' || public.bp_html(p_heading) || '</h1>'
    || '<div style="font-size:15px;line-height:23px;color:#3A362C">' || coalesce(p_body, '') || '</div>'
    || case when p_code is null then '' else
         '<div style="margin:24px 0 8px;padding:18px 0;border-radius:14px;background:#F4F0E6;text-align:center;font-size:34px;letter-spacing:10px;font-weight:bold;color:#1D1B16">'
         || public.bp_html(p_code) || '</div>' end
    || '<div style="margin-top:24px;font-size:12px;line-height:18px;color:#7A6F55">Mejlet kommer från Österlenappen. Har du frågor? Svara på mejlet så hör vi av oss.</div>'
    || '</td></tr></table></td></tr></table></body></html>';
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', 'Österlenappen <hej@osterlenappen.se>',
      'to', jsonb_build_array(btrim(p_to)),
      'reply_to', 'hej@osterlenappen.se',
      'subject', p_subject,
      'html', v_html
    ),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json')
  );
  return true;
exception when others then
  return false;
end $$;

create or replace function public.bp_email_admins(p_subject text, p_heading text, p_body text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct u.email from auth.users u
    join public.user_roles ur on ur.user_id = u.id
    where ur.role = 'admin' and u.email is not null
  loop
    perform public.send_app_email(r.email, p_subject, p_heading, p_body);
  end loop;
end $$;

create or replace function public.bp_email_owners(p_place_id bigint, p_subject text, p_heading text, p_body text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  for r in
    select u.email from public.place_members m
    join auth.users u on u.id = m.user_id
    where m.place_id = p_place_id and m.role = 'owner' and u.email is not null
  loop
    perform public.send_app_email(r.email, p_subject, p_heading, p_body);
  end loop;
end $$;

create or replace function public.bp_email_user(p_uid uuid, p_subject text, p_heading text, p_body text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_email text;
begin
  select email into v_email from auth.users where id = p_uid;
  if v_email is not null then perform public.send_app_email(v_email, p_subject, p_heading, p_body); end if;
end $$;

create or replace function public.bp_display_name(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(display_name), '') from public.profiles where user_id = p_uid), 'Någon')
$$;

-- ─── 5. "Är det här ditt företag?" ──────────────────────────────────────────

-- Allt claim-skärmen behöver veta om platsen och om mig
create or replace function public.business_claim_info(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_role text;
  v_has_owner boolean;
  v_pending text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, nearest_town, image_url, logo_url, email, claim_link_hidden into v_pl from public.places where id = p_place_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select role into v_role from public.place_members where place_id = p_place_id and user_id = v_uid;
  v_has_owner := exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner');
  select kind into v_pending from public.place_claims
  where place_id = p_place_id and user_id = v_uid and status = 'pending' order by created_at desc limit 1;
  return jsonb_build_object(
    'place', jsonb_build_object('id', v_pl.id, 'name', v_pl.name, 'town', v_pl.nearest_town, 'image_url', v_pl.image_url, 'logo_url', v_pl.logo_url),
    'role', v_role,
    'has_owner', v_has_owner,
    'link_hidden', v_pl.claim_link_hidden,
    'pending', v_pending,
    'email', case when public.app_email_ready() and public.bp_is_email(btrim(v_pl.email)) then btrim(v_pl.email) end,
    'adult', public.bp_adult(v_uid),
    'code_active', exists (
      select 1 from public.place_claim_codes c
      where c.place_id = p_place_id and c.user_id = v_uid and c.used_at is null and c.expires_at > now() and c.attempts < 5
    )
  );
end $$;

-- Skickar en kod till platsens egen e-post. Högst 3 per plats och dygn, 5 per person och dygn,
-- och en minut mellan två koder.
create or replace function public.business_claim_send_code(p_place_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_email text;
  v_code text;
  v_last timestamptz;
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, email into v_pl from public.places where id = p_place_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'is_member');
  end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'has_owner');
  end if;
  if not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  v_email := btrim(v_pl.email);
  if not public.bp_is_email(v_email) then return jsonb_build_object('ok', false, 'reason', 'no_email'); end if;
  if not public.app_email_ready() then return jsonb_build_object('ok', false, 'reason', 'email_off'); end if;

  -- En i taget per plats, så gränserna håller även om två trycker samtidigt
  perform pg_advisory_xact_lock(hashtextextended('claim:' || p_place_id::text, 0));

  select max(created_at) into v_last from public.place_claim_codes where place_id = p_place_id and user_id = v_uid;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'wait',
      'seconds', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int));
  end if;
  if (select count(*) from public.place_claim_codes where place_id = p_place_id and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_place');
  end if;
  if (select count(*) from public.place_claim_codes where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_user');
  end if;

  -- Sex slumpade siffror (gen_random_uuid använder serverns säkra slump)
  v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))::bit(24)::int) % 1000000)::text, 6, '0');
  update public.place_claim_codes set expires_at = now()
  where place_id = p_place_id and user_id = v_uid and used_at is null and expires_at > now();
  insert into public.place_claim_codes (place_id, user_id, code_hash, sent_to, expires_at)
  values (p_place_id, v_uid,
          encode(sha256(convert_to(v_code || ':' || v_uid::text || ':' || p_place_id::text, 'UTF8')), 'hex'),
          v_email, now() + interval '15 minutes');

  v_name := public.bp_display_name(v_uid);
  perform public.send_app_email(
    v_email,
    'Er kod för ' || v_pl.name || ' i Österlenappen',
    'Er kod till Österlenappen',
    '<p><b>' || public.bp_html(v_name) || '</b> vill ta hand om <b>' || public.bp_html(v_pl.name)
      || '</b> i Österlenappen – öppettider, bilder, erbjudanden och evenemang. Det kostar ingenting.</p>'
      || '<p>Skriv in koden i appen. Den gäller i 15 minuter.</p>'
      || '<p style="color:#7A6F55">Var det inte ni som bad om koden? Då kan ni bortse från mejlet – inget händer.</p>',
    v_code
  );
  return jsonb_build_object('ok', true, 'email', v_email);
end $$;

-- Rätt kod: man blir platsens ägare. Fem försök per kod.
create or replace function public.business_claim_verify(p_place_id bigint, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('claim:' || p_place_id::text, 0));
  if exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner') then
    return jsonb_build_object('ok', false, 'reason', 'has_owner');
  end if;
  select * into v_c from public.place_claim_codes
  where place_id = p_place_id and user_id = v_uid and used_at is null
  order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if v_c.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_c.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if v_c.code_hash <> encode(sha256(convert_to(
       regexp_replace(coalesce(p_code, ''), '\D', '', 'g') || ':' || v_uid::text || ':' || p_place_id::text, 'UTF8')), 'hex') then
    update public.place_claim_codes set attempts = attempts + 1 where id = v_c.id;
    return jsonb_build_object('ok', false, 'reason', case when v_c.attempts + 1 >= 5 then 'locked' else 'wrong' end,
                              'left', greatest(0, 4 - v_c.attempts));
  end if;

  update public.place_claim_codes set used_at = now() where id = v_c.id;
  insert into public.place_members (place_id, user_id, role) values (p_place_id, v_uid, 'owner')
  on conflict (place_id, user_id) do update set role = 'owner';
  update public.places set claim_link_hidden = true where id = p_place_id;
  update public.place_claims set status = 'approved', decided_at = now()
  where place_id = p_place_id and user_id = v_uid and status = 'pending';
  perform public.bp_log(p_place_id, 'claimed');
  return jsonb_build_object('ok', true);
end $$;

-- Ingen kod: en förfrågan. Till dig om platsen saknar ägare, annars till ägaren.
create or replace function public.business_request_access(
  p_place_id bigint, p_role_title text default null, p_phone text default null, p_message text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pl record;
  v_has_owner boolean;
  v_kind text;
  v_role text := nullif(btrim(coalesce(p_role_title, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select id, name, claim_link_hidden into v_pl from public.places where id = p_place_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.place_members where place_id = p_place_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'is_member');
  end if;
  v_has_owner := exists (select 1 from public.place_members where place_id = p_place_id and role = 'owner');
  if v_has_owner and v_pl.claim_link_hidden then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  v_kind := case when v_has_owner then 'join' else 'claim' end;
  if v_kind = 'claim' and not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  if char_length(coalesce(v_role, '')) > 60 or char_length(coalesce(v_msg, '')) > 600
     or (v_phone is not null and not public.bp_is_phone(v_phone)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- Du behöver kunna ringa och kolla innan du godkänner
  if v_kind = 'claim' and v_phone is null then return jsonb_build_object('ok', false, 'reason', 'phone_required'); end if;
  if exists (
    select 1 from public.place_claims
    where user_id = v_uid and place_id = p_place_id and kind = v_kind and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_claims where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into public.place_claims (kind, place_id, user_id, role_title, phone, message)
  values (v_kind, p_place_id, v_uid, v_role, v_phone, v_msg);

  v_name := public.bp_display_name(v_uid);
  if v_kind = 'claim' then
    perform public.bp_email_admins(
      'Ny förfrågan: ' || v_pl.name,
      'Någon vill ta hand om ' || v_pl.name,
      '<p><b>' || public.bp_html(v_name) || '</b>' || coalesce(' (' || public.bp_html(v_role) || ')', '')
        || ' vill sköta <b>' || public.bp_html(v_pl.name) || '</b> i Österlenappen.</p>'
        || '<p>Telefon: ' || public.bp_html(v_phone) || '</p>'
        || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
        || '<p>Godkänn eller neka i appen: Inställningar → Admin.</p>'
    );
  else
    perform public.bp_email_owners(
      p_place_id,
      v_name || ' vill gå med i ' || v_pl.name,
      v_name || ' vill hjälpa till med ' || v_pl.name,
      '<p><b>' || public.bp_html(v_name) || '</b>' || coalesce(' (' || public.bp_html(v_role) || ')', '')
        || ' vill kunna sköta <b>' || public.bp_html(v_pl.name) || '</b> i Österlenappen.</p>'
        || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
        || '<p>Godkänn eller neka i appen: Inställningar → Mitt företag → Personal.</p>'
    );
  end if;
  return jsonb_build_object('ok', true, 'kind', v_kind);
end $$;

-- Företaget finns inte i appen: en ansökan till dig
create or replace function public.business_apply_new_place(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.bp_text(p, 'name', 80);
  v_town text := public.bp_text(p, 'town', 60);
  v_cat text := public.bp_text(p, 'category', 60);
  v_web text := public.bp_url(p, 'website');
  v_phone text := public.bp_text(p, 'phone', 30);
  v_role text := public.bp_text(p, 'role_title', 60);
  v_msg text := public.bp_text(p, 'message', 600);
  v_who text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_name is null or char_length(v_name) < 2 or v_town is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if not public.bp_is_phone(v_phone) then return jsonb_build_object('ok', false, 'reason', 'phone_required'); end if;
  if not public.bp_adult(v_uid) then return jsonb_build_object('ok', false, 'reason', 'not_adult'); end if;
  if exists (select 1 from public.place_claims where user_id = v_uid and kind = 'new_place' and status = 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;
  if (select count(*) from public.place_claims where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.place_claims (kind, place_id, user_id, role_title, phone, message, new_place)
  values ('new_place', null, v_uid, v_role, v_phone, v_msg,
          jsonb_build_object('name', v_name, 'town', v_town, 'category', v_cat, 'website', v_web));
  v_who := public.bp_display_name(v_uid);
  perform public.bp_email_admins(
    'Nytt företag vill med: ' || v_name,
    v_name || ' vill finnas i Österlenappen',
    '<p><b>' || public.bp_html(v_who) || '</b>' || coalesce(' (' || public.bp_html(v_role) || ')', '')
      || ' vill lägga till <b>' || public.bp_html(v_name) || '</b> i ' || public.bp_html(v_town) || '.</p>'
      || coalesce('<p>Kategori: ' || public.bp_html(v_cat) || '</p>', '')
      || coalesce('<p>Hemsida: ' || public.bp_html(v_web) || '</p>', '')
      || '<p>Telefon: ' || public.bp_html(v_phone) || '</p>'
      || coalesce('<p>”' || public.bp_html(v_msg) || '”</p>', '')
      || '<p>Godkänn eller neka i appen: Inställningar → Admin.</p>'
  );
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.business_cancel_request(p_id uuid)
returns void language sql volatile security definer set search_path = public as $$
  update public.place_claims set status = 'cancelled', decided_at = now()
  where id = p_id and user_id = auth.uid() and status = 'pending'
$$;

-- ─── 6. Admin (du) ──────────────────────────────────────────────────────────

create or replace function public.admin_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'status', c.status, 'created_at', c.created_at, 'decided_at', c.decided_at,
      'role_title', c.role_title, 'phone', c.phone, 'message', c.message, 'new_place', c.new_place,
      'place', case when pl.id is null then null else jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'town', pl.nearest_town, 'email', pl.email, 'phone', pl.phone,
        'image_url', pl.image_url, 'logo_url', pl.logo_url) end,
      'owners', (select count(*) from public.place_members m where m.place_id = c.place_id and m.role = 'owner'),
      'user', jsonb_build_object('id', c.user_id, 'name', pr.display_name, 'username', pr.username, 'email', u.email, 'since', u.created_at)
    ) order by (c.status = 'pending') desc, c.created_at desc)
    from (
      select * from public.place_claims
      where kind in ('claim', 'new_place') and (status = 'pending' or decided_at > now() - interval '30 days')
      order by created_at desc limit 100
    ) c
    left join public.places pl on pl.id = c.place_id
    left join public.profiles pr on pr.user_id = c.user_id
    left join auth.users u on u.id = c.user_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_decide_request(p_id uuid, p_approve boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_c record;
  v_place bigint;
  v_name text;
begin
  if not public.is_app_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  select * into v_c from public.place_claims where id = p_id for update;
  if not found or v_c.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;

  if not p_approve then
    update public.place_claims set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform public.bp_email_user(v_c.user_id,
      'Om din förfrågan i Österlenappen',
      'Vi kunde inte godkänna förfrågan',
      '<p>Vi kunde tyvärr inte godkänna din förfrågan om att sköta ett företag i Österlenappen just nu.</p>'
        || '<p>Har vi missförstått något? Svara på det här mejlet så hjälper vi dig.</p>');
    return jsonb_build_object('ok', true);
  end if;

  if v_c.kind = 'new_place' then
    insert into public.places (name, categories, nearest_town, phone, website_url, claim_link_hidden)
    values (v_c.new_place ->> 'name', nullif(v_c.new_place ->> 'category', ''), nullif(v_c.new_place ->> 'town', ''),
            v_c.phone, nullif(v_c.new_place ->> 'website', ''), true)
    returning id into v_place;
  else
    v_place := v_c.place_id;
  end if;

  insert into public.place_members (place_id, user_id, role)
  values (v_place, v_c.user_id, case when v_c.kind = 'join' then 'staff' else 'owner' end)
  on conflict (place_id, user_id) do update set role = excluded.role;
  update public.places set claim_link_hidden = true where id = v_place;
  update public.place_claims set status = 'approved', decided_at = now(), decided_by = auth.uid(), place_id = v_place where id = p_id;

  select name into v_name from public.places where id = v_place;
  perform public.bp_email_user(v_c.user_id,
    'Nu kan du sköta ' || v_name || ' i Österlenappen',
    'Välkommen, ' || v_name || '!',
    '<p>Nu kan du sköta <b>' || public.bp_html(v_name) || '</b> i Österlenappen: öppettider, bilder, erbjudanden, '
      || 'evenemang och berättelser.</p><p>Öppna appen och gå till Inställningar → Mitt företag.</p>');
  return jsonb_build_object('ok', true, 'place_id', v_place);
end $$;

-- ─── 7. Mitt företag och personalen ─────────────────────────────────────────

-- Det Inställningar behöver: mina platser, inbjudningar till mig, mina förfrågningar och (för dig)
-- hur många förfrågningar som väntar
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
      else null end
  );
end $$;

create or replace function public.business_accept_terms(p_place_id bigint)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  update public.place_members set terms_accepted_at = now() where place_id = p_place_id and user_id = auth.uid();
end $$;

create or replace function public.business_team(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return jsonb_build_object(
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', pr.display_name, 'username', pr.username, 'color', pr.circle_color,
        'role', m.role, 'since', m.created_at, 'me', m.user_id = auth.uid()
      ) order by (m.role = 'owner') desc, m.created_at), '[]'::jsonb)
      from public.place_members m left join public.profiles pr on pr.user_id = m.user_id
      where m.place_id = p_place_id
    ),
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at)
        order by i.created_at desc), '[]'::jsonb)
      from public.place_invites i
      where i.place_id = p_place_id and i.accepted_at is null and i.declined_at is null and i.expires_at > now()
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'name', pr.display_name, 'username', pr.username,
        'role_title', c.role_title, 'message', c.message, 'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.place_claims c left join public.profiles pr on pr.user_id = c.user_id
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

-- Bjud in med e-post. Personen ser inbjudan i appen när hen loggat in med samma adress.
create or replace function public.business_invite(p_place_id bigint, p_email text, p_role text default 'staff')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_place text;
  v_from text;
  v_sent boolean;
begin
  perform public.bp_require_member(p_place_id, true);
  if not public.bp_is_email(v_email) then return jsonb_build_object('ok', false, 'reason', 'invalid_email'); end if;
  if p_role not in ('owner', 'staff') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if exists (
    select 1 from public.place_members m join auth.users u on u.id = m.user_id
    where m.place_id = p_place_id and lower(u.email) = v_email
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;
  if (select count(*) from public.place_invites
      where place_id = p_place_id and accepted_at is null and declined_at is null and expires_at > now()) >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  delete from public.place_invites where place_id = p_place_id and lower(email) = v_email and accepted_at is null;
  insert into public.place_invites (place_id, email, role, invited_by) values (p_place_id, v_email, p_role, auth.uid());

  select name into v_place from public.places where id = p_place_id;
  v_from := public.bp_display_name(auth.uid());
  v_sent := public.send_app_email(
    v_email,
    v_from || ' har bjudit in dig till ' || v_place,
    'Du är inbjuden till ' || v_place,
    '<p><b>' || public.bp_html(v_from) || '</b> vill att du hjälper till med <b>' || public.bp_html(v_place)
      || '</b> i Österlenappen – öppettider, bilder, erbjudanden och evenemang.</p>'
      || '<p>Ladda ner Österlenappen och logga in med den här e-postadressen (' || public.bp_html(v_email)
      || '). Inbjudan väntar under Inställningar.</p>'
  );
  perform public.bp_log(p_place_id, 'team');
  return jsonb_build_object('ok', true, 'emailed', v_sent);
end $$;

create or replace function public.business_cancel_invite(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_place bigint;
begin
  select place_id into v_place from public.place_invites where id = p_id;
  if v_place is null then return; end if;
  perform public.bp_require_member(v_place, true);
  delete from public.place_invites where id = p_id;
end $$;

create or replace function public.business_answer_invite(p_id uuid, p_accept boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_i record;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid;
  select * into v_i from public.place_invites
  where id = p_id and lower(email) = lower(coalesce(v_email, '')) and accepted_at is null and declined_at is null and expires_at > now()
  for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_accept then
    insert into public.place_members (place_id, user_id, role, invited_by)
    values (v_i.place_id, v_uid, v_i.role, v_i.invited_by)
    on conflict (place_id, user_id) do update
      set role = case when excluded.role = 'owner' then 'owner' else public.place_members.role end;
    update public.place_invites set accepted_at = now(), accepted_by = v_uid where id = p_id;
    perform public.bp_log(v_i.place_id, 'joined');
  else
    update public.place_invites set declined_at = now() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'place_id', v_i.place_id);
end $$;

-- Ägaren svarar på en förfrågan om att gå med
create or replace function public.business_answer_join(p_id uuid, p_accept boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_c record;
  v_place text;
begin
  select * into v_c from public.place_claims where id = p_id and kind = 'join' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.bp_require_member(v_c.place_id, true);
  if v_c.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending'); end if;
  update public.place_claims set status = case when p_accept then 'approved' else 'rejected' end,
    decided_at = now(), decided_by = auth.uid() where id = p_id;
  if p_accept then
    insert into public.place_members (place_id, user_id, role, invited_by)
    values (v_c.place_id, v_c.user_id, 'staff', auth.uid())
    on conflict (place_id, user_id) do nothing;
    select name into v_place from public.places where id = v_c.place_id;
    perform public.bp_email_user(v_c.user_id,
      'Du kan nu sköta ' || v_place || ' i Österlenappen',
      'Välkommen till ' || v_place || '!',
      '<p>Du har fått tillgång till <b>' || public.bp_html(v_place) || '</b> i Österlenappen.</p>'
        || '<p>Öppna appen och gå till Inställningar → Mitt företag.</p>');
    perform public.bp_log(v_c.place_id, 'team');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.business_set_member_role(p_place_id bigint, p_user_id uuid, p_role text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_old text;
begin
  perform public.bp_require_member(p_place_id, true);
  if p_role not in ('owner', 'staff') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended('members:' || p_place_id::text, 0));
  select role into v_old from public.place_members where place_id = p_place_id and user_id = p_user_id for update;
  if v_old is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_old = 'owner' and p_role = 'staff'
     and (select count(*) from public.place_members where place_id = p_place_id and role = 'owner') <= 1 then
    return jsonb_build_object('ok', false, 'reason', 'last_owner');
  end if;
  update public.place_members set role = p_role where place_id = p_place_id and user_id = p_user_id;
  perform public.bp_log(p_place_id, 'team');
  return jsonb_build_object('ok', true);
end $$;

-- Ta bort någon (ägare), eller lämna själv. Den sista ägaren kan inte gå så länge andra finns kvar.
create or replace function public.business_remove_member(p_place_id bigint, p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_owners int;
  v_others int;
begin
  if p_user_id = v_me then perform public.bp_require_member(p_place_id); else perform public.bp_require_member(p_place_id, true); end if;
  perform pg_advisory_xact_lock(hashtextextended('members:' || p_place_id::text, 0));
  select role into v_role from public.place_members where place_id = p_place_id and user_id = p_user_id;
  if v_role is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select count(*) filter (where role = 'owner'), count(*) filter (where user_id <> p_user_id)
    into v_owners, v_others from public.place_members where place_id = p_place_id;
  if v_role = 'owner' and v_owners <= 1 and v_others > 0 then
    return jsonb_build_object('ok', false, 'reason', 'last_owner');
  end if;
  delete from public.place_members where place_id = p_place_id and user_id = p_user_id;
  if p_user_id <> v_me then perform public.bp_log(p_place_id, 'team'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─── 8. Erbjudanden ─────────────────────────────────────────────────────────

-- Om personen som skapade erbjudandet tar bort sitt konto ska erbjudandet (och medlemmarnas
-- inlösen) finnas kvar — tidigare försvann allt med kontot
alter table public.offers alter column user_id drop not null;
alter table public.offers drop constraint if exists offers_user_id_fkey;
alter table public.offers add constraint offers_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- Appen skriver aldrig direkt i erbjudanden, evenemang, berättelser eller platser. Alla gamla
-- skrivregler tas bort (läsreglerna läggs tillbaka nedan), så bara databasens funktioner kan ändra.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('offers', 'events', 'business_stories', 'places')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.offers enable row level security;
drop policy if exists "Alla inloggade kan läsa erbjudanden" on public.offers;
create policy "Alla inloggade kan läsa erbjudanden" on public.offers for select to authenticated using (true);
revoke insert, update, delete, truncate on public.offers from anon, authenticated;

alter table public.places enable row level security;
drop policy if exists "Inloggade kan läsa platser" on public.places;
create policy "Inloggade kan läsa platser" on public.places for select to authenticated using (true);
revoke insert, update, delete, truncate on public.places from anon, authenticated;

-- Medlem med ett giltigt pass just nu (samma regler som membershipStatus i src/lib/membership.ts)
create or replace function public.is_active_member(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(p.is_member, false)
      and (p.member_started_at is null or p.member_started_at <= now())
      and (p.member_until is null or
           p.member_until + case when not coalesce(p.member_auto_renew, false) and coalesce(p.member_bonus_days, 0) > 0
                                 then make_interval(days => p.member_bonus_days) else interval '0' end >= now())
    from public.profiles p where p.user_id = p_uid
  ), false)
$$;

-- Reglerna för att lösa in (från 025), plus: bara med giltigt pass, och aldrig hos sitt eget företag
create or replace function public.offer_redemptions_check_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  used_count int;
  last_at timestamptz;
  max_uses int;
  win interval;
begin
  -- Två aktiveringar av samma erbjudande samtidigt (dubbeltryck, två telefoner) får inte båda
  -- slinka igenom: den ena väntar tills den andra är klar
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.offer_id::text, 0));

  select place_id, is_active, expires_at, redemption_limit, redemption_interval
    into o
  from public.offers
  where id = new.offer_id;

  if not found or not o.is_active or (o.expires_at is not null and o.expires_at < now()) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  if not public.is_active_member(new.user_id) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.place_members m where m.place_id = o.place_id and m.user_id = new.user_id) then
    raise exception 'own_offer' using errcode = 'P0001';
  end if;

  select count(*), max(r.activated_at)
    into used_count, last_at
  from public.offer_redemptions r
  where r.user_id = new.user_id and r.offer_id = new.offer_id;

  -- Samma regler som offerEligibility() i src/lib/offers.ts
  max_uses := coalesce(o.redemption_limit, case when o.redemption_interval = 'once' then 1 end);
  if max_uses is not null and used_count >= max_uses then
    raise exception 'offer_already_used' using errcode = 'P0001';
  end if;

  win := case o.redemption_interval
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '30 days'
  end;
  if win is not null and last_at is not null and last_at + win > now() then
    raise exception 'offer_not_yet_available' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists offer_redemptions_check_rules on public.offer_redemptions;
create trigger offer_redemptions_check_rules
  before insert on public.offer_redemptions
  for each row execute function public.offer_redemptions_check_rules();

-- Skapa eller ändra ett erbjudande. Har någon redan löst in det får bara bilden och slutdatumet ändras.
create or replace function public.business_save_offer(p_place_id bigint, p_offer jsonb, p_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_title text := btrim(coalesce(p_offer ->> 'title', ''));
  v_desc text := public.bp_text(p_offer, 'description', 400);
  v_label text := public.bp_text(p_offer, 'savings_label', 40);
  v_value int;
  v_cat text := nullif(btrim(coalesce(p_offer ->> 'category', '')), '');
  v_int text := coalesce(nullif(p_offer ->> 'redemption_interval', ''), 'once');
  v_limit int;
  v_exp timestamptz;
  v_img text := nullif(btrim(coalesce(p_offer ->> 'image_url', '')), '');
  v_o record;
  v_new uuid;
begin
  perform public.bp_require_member(p_place_id);
  if char_length(v_title) < 2 or char_length(v_title) > 60 then raise exception 'invalid:title' using errcode = 'P0001'; end if;
  if p_offer ? 'savings_value' and jsonb_typeof(p_offer -> 'savings_value') <> 'null' then
    v_value := (p_offer ->> 'savings_value')::int;
    if v_value < 0 or v_value > 5000 then raise exception 'invalid:savings_value' using errcode = 'P0001'; end if;
  end if;
  if v_cat is not null and v_cat not in ('Mat & Dryck', 'Hotell & B&B', 'Natur & Upplevelser', 'Butiker') then
    raise exception 'invalid:category' using errcode = 'P0001';
  end if;
  if v_int not in ('once', 'daily', 'weekly', 'monthly', 'unlimited') then raise exception 'invalid:redemption_interval' using errcode = 'P0001'; end if;
  if v_int <> 'once' and p_offer ? 'redemption_limit' and jsonb_typeof(p_offer -> 'redemption_limit') <> 'null' then
    v_limit := (p_offer ->> 'redemption_limit')::int;
    if v_limit < 1 or v_limit > 999 then raise exception 'invalid:redemption_limit' using errcode = 'P0001'; end if;
  end if;
  if p_offer ? 'expires_at' and jsonb_typeof(p_offer -> 'expires_at') <> 'null' then
    v_exp := (p_offer ->> 'expires_at')::timestamptz;
    if v_exp > now() + interval '2 years' then raise exception 'invalid:expires_at' using errcode = 'P0001'; end if;
  end if;
  if v_img is not null and not public.bp_image_ok(p_place_id, v_img) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;

  if p_id is null then
    if v_exp is not null and v_exp < now() then raise exception 'invalid:expires_at' using errcode = 'P0001'; end if;
    if (select count(*) from public.offers
        where place_id = p_place_id and is_active and (expires_at is null or expires_at > now())) >= 10 then
      raise exception 'too_many:offers' using errcode = 'P0001';
    end if;
    insert into public.offers (place_id, user_id, title, description, image_url, savings_label, savings_value, category,
                               redemption_limit, redemption_interval, expires_at, is_active)
    values (p_place_id, auth.uid(), v_title, v_desc, v_img, v_label, v_value, v_cat, v_limit, v_int, v_exp, true)
    returning id into v_new;
    perform public.bp_log(p_place_id, 'offer');
    return v_new;
  end if;

  select * into v_o from public.offers where id = p_id and place_id = p_place_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.offer_redemptions where offer_id = p_id)
     and (v_o.title, v_o.description, v_o.savings_label, v_o.savings_value, v_o.category, v_o.redemption_interval, v_o.redemption_limit)
         is distinct from (v_title, v_desc, v_label, v_value, v_cat, v_int, v_limit) then
    raise exception 'locked' using errcode = 'P0001';
  end if;
  update public.offers set
    title = v_title, description = v_desc, image_url = v_img, savings_label = v_label, savings_value = v_value,
    category = v_cat, redemption_limit = v_limit, redemption_interval = v_int, expires_at = v_exp, updated_at = now()
  where id = p_id;
  perform public.bp_log(p_place_id, 'offer');
  return p_id;
end $$;

-- Pausa, starta igen, avsluta eller ta bort. Ett erbjudande som lösts in tas aldrig bort på riktigt
-- (medlemmarnas historik ska finnas kvar) — det avslutas i stället.
create or replace function public.business_offer_action(p_id uuid, p_action text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_o record;
begin
  select * into v_o from public.offers where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.bp_require_member(v_o.place_id);
  if p_action = 'pause' then
    update public.offers set is_active = false, updated_at = now() where id = p_id;
  elsif p_action = 'resume' then
    if v_o.expires_at is not null and v_o.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
    update public.offers set is_active = true, updated_at = now() where id = p_id;
  elsif p_action = 'end' then
    update public.offers set expires_at = now(), updated_at = now() where id = p_id;
  elsif p_action = 'delete' then
    if exists (select 1 from public.offer_redemptions where offer_id = p_id) then
      update public.offers set expires_at = least(coalesce(expires_at, now()), now()), is_active = false, updated_at = now() where id = p_id;
      perform public.bp_log(v_o.place_id, 'offer');
      return jsonb_build_object('ok', true, 'ended', true);
    end if;
    delete from public.offers where id = p_id;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform public.bp_log(v_o.place_id, 'offer');
  return jsonb_build_object('ok', true);
end $$;

-- Platsens alla erbjudanden (även pausade och avslutade) med hur många som löst in
create or replace function public.business_offers(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'offer', to_jsonb(o),
      'redemptions', (select count(*) from public.offer_redemptions r where r.offer_id = o.id),
      'people', (select count(distinct r.user_id) from public.offer_redemptions r where r.offer_id = o.id),
      'recent', (select count(*) from public.offer_redemptions r where r.offer_id = o.id and r.activated_at > now() - interval '30 days')
    ) order by o.created_at desc)
    from public.offers o where o.place_id = p_place_id
  ), '[]'::jsonb);
end $$;

-- ─── 9. Evenemang ───────────────────────────────────────────────────────────

alter table public.events add column if not exists series_id uuid;
alter table public.events add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.events add column if not exists created_at timestamptz not null default now();
create index if not exists events_place_date_idx on public.events (place_id, date);
create index if not exists events_series_idx on public.events (series_id);

alter table public.events enable row level security;
drop policy if exists "Alla kan läsa evenemang" on public.events;
create policy "Alla kan läsa evenemang" on public.events for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.events from anon, authenticated;

-- Skapa ett evenemang, ett tillfälle per datum (återkommande hänger ihop med series_id), eller
-- ändra ett. p_scope = 'series' ändrar alla kommande tillfällen i serien (men inte datumen).
create or replace function public.business_save_event(
  p_place_id bigint, p_event jsonb, p_dates date[] default null, p_id bigint default null, p_scope text default 'one'
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_cats text[] := array['Musik', 'Matupplevelse', 'Konst & Kultur', 'Marknad', 'Familj', 'Natur', 'Guidning', 'Hälsa & Välmående', 'Övrigt'];
  v_title text := btrim(coalesce(p_event ->> 'title', ''));
  v_desc text := public.bp_text(p_event, 'description', 2000);
  v_time text := public.bp_text(p_event, 'time', 20);
  v_loc text := public.bp_text(p_event, 'location', 120);
  v_img text := nullif(btrim(coalesce(p_event ->> 'image_url', '')), '');
  v_cat text := nullif(btrim(coalesce(p_event ->> 'main_category', '')), '');
  v_tickets boolean := coalesce((p_event ->> 'tickets_required')::boolean, false);
  v_booking boolean := coalesce((p_event ->> 'booking_required')::boolean, false);
  v_indoor boolean := coalesce((p_event ->> 'is_indoor')::boolean, false);
  v_food boolean := coalesce((p_event ->> 'has_food_drink')::boolean, false);
  v_parking boolean := coalesce((p_event ->> 'has_parking')::boolean, false);
  v_ticket text := public.bp_url(p_event, 'ticket_url');
  v_date date := nullif(p_event ->> 'date', '')::date;
  v_end date := nullif(p_event ->> 'end_date', '')::date;
  v_span int;
  v_series uuid;
  v_dates date[];
  v_d date;
  v_id bigint;
  v_ids bigint[] := '{}';
  v_e record;
begin
  perform public.bp_require_member(p_place_id);
  if char_length(v_title) < 2 or char_length(v_title) > 70 then raise exception 'invalid:title' using errcode = 'P0001'; end if;
  if v_date is null then raise exception 'invalid:date' using errcode = 'P0001'; end if;
  if v_end is not null and (v_end < v_date or v_end - v_date > 30) then raise exception 'invalid:end_date' using errcode = 'P0001'; end if;
  if v_cat is not null and not (v_cat = any(v_cats)) then raise exception 'invalid:main_category' using errcode = 'P0001'; end if;
  if v_img is not null and not public.bp_image_ok(p_place_id, v_img) then raise exception 'invalid:image_url' using errcode = 'P0001'; end if;
  if not (v_tickets or v_booking) then v_ticket := null; end if;
  v_span := case when v_end is null then null else v_end - v_date end;
  -- Utan egen bild får evenemanget platsens första bild
  if v_img is null then
    select (public.bp_images(image_url))[1] into v_img from public.places where id = p_place_id;
  end if;

  if p_id is null then
    select array_agg(distinct x order by x) into v_dates from unnest(coalesce(p_dates, '{}'::date[]) || v_date) x;
    if cardinality(v_dates) > 52 then raise exception 'too_many:dates' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(v_dates) x where x < v_today - 1 or x > v_today + 730) then
      raise exception 'invalid:date' using errcode = 'P0001';
    end if;
    if (select count(*) from public.events where place_id = p_place_id and coalesce(end_date, date) >= v_today) + cardinality(v_dates) > 200 then
      raise exception 'too_many:events' using errcode = 'P0001';
    end if;
    v_series := case when cardinality(v_dates) > 1 then gen_random_uuid() end;
    foreach v_d in array v_dates loop
      insert into public.events (title, description, date, end_date, time, location, image_url, main_category, is_featured,
                                 place_id, tickets_required, booking_required, ticket_url, is_indoor, has_food_drink,
                                 has_parking, series_id, created_by)
      values (v_title, v_desc, v_d, case when v_span is null then null else v_d + v_span end, v_time, v_loc, v_img, v_cat, false,
              p_place_id, v_tickets, v_booking, v_ticket, v_indoor, v_food, v_parking, v_series, v_uid)
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
    perform public.bp_log(p_place_id, 'event');
    return jsonb_build_object('ids', to_jsonb(v_ids), 'series_id', v_series);
  end if;

  select * into v_e from public.events where id = p_id and place_id = p_place_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_scope = 'series' and v_e.series_id is not null then
    update public.events set
      title = v_title, description = v_desc, time = v_time, location = v_loc, image_url = v_img, main_category = v_cat,
      tickets_required = v_tickets, booking_required = v_booking, ticket_url = v_ticket, is_indoor = v_indoor,
      has_food_drink = v_food, has_parking = v_parking,
      end_date = case when v_span is null then null else date + v_span end
    where series_id = v_e.series_id and place_id = p_place_id and date >= least(v_e.date, v_today);
  else
    update public.events set
      title = v_title, description = v_desc, date = v_date, end_date = v_end, time = v_time, location = v_loc,
      image_url = v_img, main_category = v_cat, tickets_required = v_tickets, booking_required = v_booking,
      ticket_url = v_ticket, is_indoor = v_indoor, has_food_drink = v_food, has_parking = v_parking
    where id = p_id;
  end if;
  perform public.bp_log(p_place_id, 'event');
  return jsonb_build_object('ids', jsonb_build_array(p_id), 'series_id', v_e.series_id);
end $$;

-- Ta bort ett tillfälle, eller alla kommande i serien
create or replace function public.business_delete_event(p_id bigint, p_scope text default 'one')
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_e record;
  v_ids bigint[];
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  select * into v_e from public.events where id = p_id;
  if not found then return 0; end if;
  perform public.bp_require_member(v_e.place_id);
  if p_scope = 'series' and v_e.series_id is not null then
    select array_agg(id) into v_ids from public.events
    where series_id = v_e.series_id and place_id = v_e.place_id and date >= least(v_e.date, v_today);
  else
    v_ids := array[p_id];
  end if;
  delete from public.favorites where event_id = any(v_ids);
  delete from public.events where id = any(v_ids);
  perform public.bp_log(v_e.place_id, 'event');
  return cardinality(v_ids);
end $$;

-- ─── 10. Berättelser (stories) ──────────────────────────────────────────────

-- En klistermärkeslänk i berättelsen: { kind: 'offer' | 'event', id, x, y, w, h } (andelar av bilden)
alter table public.business_stories add column if not exists link jsonb;

alter table public.business_stories enable row level security;
drop policy if exists "Alla kan läsa berättelser" on public.business_stories;
create policy "Alla kan läsa berättelser" on public.business_stories for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.business_stories from anon, authenticated;

create or replace function public.business_post_story(p_place_id bigint, p_image_url text, p_caption text default null, p_link jsonb default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_link jsonb;
  v_id uuid;
  v_kind text;
  v_ok boolean := false;
begin
  perform public.bp_require_member(p_place_id);
  -- Berättelser är alltid nya bilder i platsens egen mapp
  if p_image_url is null or not starts_with(p_image_url, public.bp_media_prefix(p_place_id))
     or not public.bp_image_ok(p_place_id, p_image_url) then
    raise exception 'invalid:image_url' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_caption, '')) > 300 then raise exception 'too_long:caption' using errcode = 'P0001'; end if;
  if p_link is not null and jsonb_typeof(p_link) = 'object' then
    v_kind := p_link ->> 'kind';
    -- Jämförs som text: ett id i fel form ska ge "fel länk", inte ett tekniskt fel
    if v_kind = 'offer' then
      v_ok := exists (select 1 from public.offers where id::text = p_link ->> 'id' and place_id = p_place_id);
    elsif v_kind = 'event' then
      v_ok := exists (select 1 from public.events where id::text = p_link ->> 'id' and place_id = p_place_id);
    end if;
    if v_ok then
      v_link := jsonb_build_object(
        'kind', v_kind, 'id', p_link ->> 'id',
        'x', least(1, greatest(0, coalesce((p_link ->> 'x')::numeric, 0))),
        'y', least(1, greatest(0, coalesce((p_link ->> 'y')::numeric, 0))),
        'w', least(1, greatest(0, coalesce((p_link ->> 'w')::numeric, 0))),
        'h', least(1, greatest(0, coalesce((p_link ->> 'h')::numeric, 0))));
    else
      raise exception 'invalid:link' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from public.business_stories where place_id = p_place_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'too_many:stories' using errcode = 'P0001';
  end if;
  insert into public.business_stories (user_id, place_id, image_url, caption, filter, is_premium, expires_at, link)
  values (auth.uid(), p_place_id, p_image_url, v_caption, 'none', false, now() + interval '24 hours', v_link)
  returning id into v_id;
  perform public.bp_log(p_place_id, 'story');
  return v_id;
end $$;

create or replace function public.business_delete_story(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_place bigint;
begin
  select place_id into v_place from public.business_stories where id = p_id;
  if v_place is null then return; end if;
  perform public.bp_require_member(v_place);
  delete from public.business_stories where id = p_id;
end $$;

-- Platsens berättelser de senaste 30 dagarna och hur många som sett var och en
create or replace function public.business_stories_overview(p_place_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.bp_require_member(p_place_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'image_url', s.image_url, 'caption', s.caption, 'created_at', s.created_at,
      'expires_at', s.expires_at, 'link', s.link,
      'views', (select count(*) from public.story_views v where v.story_id::text = s.id::text)
    ) order by s.created_at desc)
    from public.business_stories s
    where s.place_id = p_place_id and s.created_at > now() - interval '30 days' and not coalesce(s.is_premium, false)
  ), '[]'::jsonb);
end $$;

-- ─── 11. Bilder ─────────────────────────────────────────────────────────────
-- Bucketen place-media: en mapp per plats (place-media/<platsens id>/…). Alla kan se bilderna (de
-- syns i appen), bara de som sköter platsen kan lägga till och ta bort.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('place-media', 'place-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_place_media(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1) ~ '^[0-9]{1,12}$' then exists (
      select 1 from public.place_members m
      where m.place_id = split_part(p_name, '/', 1)::bigint and m.user_id = auth.uid()
    )
    else false
  end
$$;

drop policy if exists "Place members read own media" on storage.objects;
create policy "Place members read own media" on storage.objects for select to authenticated
  using (bucket_id = 'place-media' and public.can_manage_place_media(name));
drop policy if exists "Place members upload media" on storage.objects;
create policy "Place members upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-media' and public.can_manage_place_media(name));
drop policy if exists "Place members delete media" on storage.objects;
create policy "Place members delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'place-media' and public.can_manage_place_media(name));

-- ─── 12. Statistik ──────────────────────────────────────────────────────────

alter table public.business_analytics add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.business_analytics add column if not exists source text;
create index if not exists business_analytics_place_time_idx on public.business_analytics (place_id, event_type, created_at desc);
create index if not exists business_analytics_user_idx on public.business_analytics (user_id, created_at desc);

-- Ingen i appen läser eller skriver tabellen direkt (förut kunde vem som helst läsa allt)
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'business_analytics' loop
    execute format('drop policy %I on public.business_analytics', r.policyname);
  end loop;
end $$;
alter table public.business_analytics enable row level security;
revoke all on public.business_analytics from anon, authenticated;

-- Räknar en visning, ett klick eller en vägbeskrivning. Den som sköter platsen räknas inte, samma
-- person räknas som en visning per halvtimme, och ett dubbeltryck räknas en gång.
create or replace function public.track_place_event(p_place_id bigint, p_kind text, p_link text default null, p_source text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_link text := case when p_kind = 'link_click' and p_link in ('phone', 'website', 'book', 'instagram', 'facebook', 'email') then p_link end;
  v_source text := case when p_source in ('home', 'search', 'map', 'calendar', 'profile', 'category', 'lists', 'place', 'offers', 'story', 'friends', 'other') then p_source end;
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

-- Statistiken för en period (7, 30 eller 365 dagar), jämfört med perioden innan
create or replace function public.business_stats(p_place_id bigint, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := case when p_days in (7, 30, 365) then p_days else 30 end;
  v_cur timestamptz := now() - make_interval(days => v_days);
  v_prev timestamptz := now() - make_interval(days => v_days * 2);
  v_local date := (now() at time zone 'Europe/Stockholm')::date;
  v_res jsonb;
  v_visitors int;
begin
  perform public.bp_require_member(p_place_id);

  select jsonb_build_object(
    'days', v_days,
    'views', count(*) filter (where event_type = 'profile_view' and created_at >= v_cur),
    'views_prev', count(*) filter (where event_type = 'profile_view' and created_at < v_cur),
    'visitors', count(distinct user_id) filter (where event_type = 'profile_view' and created_at >= v_cur),
    'visitors_prev', count(distinct user_id) filter (where event_type = 'profile_view' and created_at < v_cur),
    'clicks', count(*) filter (where event_type = 'link_click' and created_at >= v_cur),
    'clicks_prev', count(*) filter (where event_type = 'link_click' and created_at < v_cur),
    'directions', count(*) filter (where event_type = 'navigation_click' and created_at >= v_cur),
    'directions_prev', count(*) filter (where event_type = 'navigation_click' and created_at < v_cur)
  ) into v_res
  from public.business_analytics
  where place_id = p_place_id and created_at >= v_prev;

  v_res := v_res || jsonb_build_object(
    'links', coalesce((
      select jsonb_object_agg(l, n) from (
        select coalesce(link_type, 'other') l, count(*) n from public.business_analytics
        where place_id = p_place_id and event_type = 'link_click' and created_at >= v_cur group by 1
      ) x), '{}'::jsonb),
    'sources', coalesce((
      select jsonb_object_agg(s, n) from (
        select coalesce(source, 'other') s, count(*) n from public.business_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur group by 1
      ) x), '{}'::jsonb),
    'favorites_total', (select count(*) from public.favorites where place_id = p_place_id),
    'favorites_new', (select count(*) from public.favorites where place_id = p_place_id and created_at >= v_cur),
    'favorites_new_prev', (select count(*) from public.favorites where place_id = p_place_id and created_at >= v_prev and created_at < v_cur),
    'checkins', (select count(*) from public.visits where place_id = p_place_id and visited_at >= v_cur),
    'checkins_prev', (select count(*) from public.visits where place_id = p_place_id and visited_at >= v_prev and visited_at < v_cur),
    'redemptions', (
      select count(*) from public.offer_redemptions r join public.offers o on o.id = r.offer_id
      where o.place_id = p_place_id and r.activated_at >= v_cur),
    'redemptions_prev', (
      select count(*) from public.offer_redemptions r join public.offers o on o.id = r.offer_id
      where o.place_id = p_place_id and r.activated_at >= v_prev and r.activated_at < v_cur),
    'story_views', (
      select count(*) from public.story_views v join public.business_stories s on s.id::text = v.story_id::text
      where s.place_id = p_place_id and v.viewed_at >= v_cur)
  );

  if v_days <= 30 then
    v_res := v_res || jsonb_build_object('series', (
      select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'views', coalesce(x.views, 0), 'visitors', coalesce(x.visitors, 0))
        order by g.d), '[]'::jsonb)
      from generate_series((v_local - (v_days - 1))::timestamp, v_local::timestamp, interval '1 day') as g(d)
      left join (
        select (created_at at time zone 'Europe/Stockholm')::date dd, count(*) views, count(distinct user_id) visitors
        from public.business_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur - interval '1 day'
        group by 1
      ) x on x.dd = g.d::date
    ));
  else
    v_res := v_res || jsonb_build_object('series', (
      select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'views', coalesce(x.views, 0), 'visitors', coalesce(x.visitors, 0))
        order by g.d), '[]'::jsonb)
      from generate_series(date_trunc('month', v_local::timestamp) - interval '11 months', date_trunc('month', v_local::timestamp), interval '1 month') as g(d)
      left join (
        select date_trunc('month', created_at at time zone 'Europe/Stockholm') mm, count(*) views, count(distinct user_id) visitors
        from public.business_analytics
        where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur - interval '31 days'
        group by 1
      ) x on x.mm = g.d
    ));
  end if;

  -- Vilka som tittar: bara när tillräckligt många tittat, och bara grupper med minst 5 personer
  select count(distinct user_id) into v_visitors from public.business_analytics
  where place_id = p_place_id and event_type = 'profile_view' and created_at >= v_cur and user_id is not null;

  if v_visitors >= 20 then
    v_res := v_res || jsonb_build_object('audience', (
      with people as (
        select distinct a.user_id from public.business_analytics a
        where a.place_id = p_place_id and a.event_type = 'profile_view' and a.created_at >= v_cur and a.user_id is not null
      ),
      prof as (
        select pr.birth_date, pr.birth_year, pr.city, pr.lives_in_osterlen
        from people x join public.profiles pr on pr.user_id = x.user_id
      ),
      ages as (
        select case
          when age < 25 then 'under25' when age < 35 then '25-34' when age < 45 then '35-44'
          when age < 55 then '45-54' when age < 65 then '55-64' else '65plus' end bucket
        from (
          select extract(year from age(v_local, coalesce(birth_date, make_date(birth_year, 7, 1))))::int age
          from prof where birth_date is not null or birth_year is not null
        ) y
      )
      select jsonb_build_object(
        'people', v_visitors,
        'ages', coalesce((select jsonb_object_agg(bucket, n) from (select bucket, count(*) n from ages group by bucket having count(*) >= 5) a), '{}'::jsonb),
        'towns', coalesce((
          select jsonb_agg(jsonb_build_object('town', town, 'n', n) order by n desc) from (
            select btrim(city) town, count(*) n from prof where nullif(btrim(city), '') is not null
            group by btrim(city) having count(*) >= 5 order by count(*) desc limit 5
          ) t), '[]'::jsonb),
        'local', (select count(*) from prof where lives_in_osterlen is true),
        'visiting', (select count(*) from prof where lives_in_osterlen is false)
      )
    ));
  else
    v_res := v_res || jsonb_build_object('audience', null, 'audience_people', v_visitors);
  end if;

  return v_res;
end $$;

-- ─── 13. Vem får köra vad ───────────────────────────────────────────────────

-- Hjälparna och mejlen är bara till för databasens egna funktioner
revoke execute on function public.bp_text(jsonb, text, int) from public, anon, authenticated;
revoke execute on function public.bp_url(jsonb, text) from public, anon, authenticated;
revoke execute on function public.bp_is_email(text) from public, anon, authenticated;
revoke execute on function public.bp_is_phone(text) from public, anon, authenticated;
revoke execute on function public.bp_html(text) from public, anon, authenticated;
revoke execute on function public.bp_images(text) from public, anon, authenticated;
revoke execute on function public.bp_media_prefix(bigint) from public, anon, authenticated;
revoke execute on function public.bp_image_ok(bigint, text) from public, anon, authenticated;
revoke execute on function public.bp_adult(uuid) from public, anon, authenticated;
revoke execute on function public.bp_require_member(bigint, boolean) from public, anon, authenticated;
revoke execute on function public.bp_log(bigint, text) from public, anon, authenticated;
revoke execute on function public.bp_clean_exceptions(jsonb) from public, anon, authenticated;
revoke execute on function public.bp_display_name(uuid) from public, anon, authenticated;
revoke execute on function public.app_email_key() from public, anon, authenticated;
revoke execute on function public.app_email_ready() from public, anon, authenticated;
revoke execute on function public.send_app_email(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.bp_email_admins(text, text, text) from public, anon, authenticated;
revoke execute on function public.bp_email_owners(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.bp_email_user(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.is_active_member(uuid) from public, anon, authenticated;
revoke execute on function public.place_members_after_delete() from public, anon, authenticated;

-- Det appen anropar (alla kontrollerar själva vem man är och vad man sköter)
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_app_admin()',
    'public.is_place_member(bigint)',
    'public.can_manage_place_media(text)',
    'public.business_update_place(bigint, jsonb)',
    'public.business_claim_info(bigint)',
    'public.business_claim_send_code(bigint)',
    'public.business_claim_verify(bigint, text)',
    'public.business_request_access(bigint, text, text, text)',
    'public.business_apply_new_place(jsonb)',
    'public.business_cancel_request(uuid)',
    'public.admin_requests()',
    'public.admin_decide_request(uuid, boolean)',
    'public.business_overview()',
    'public.business_accept_terms(bigint)',
    'public.business_team(bigint)',
    'public.business_invite(bigint, text, text)',
    'public.business_cancel_invite(uuid)',
    'public.business_answer_invite(uuid, boolean)',
    'public.business_answer_join(uuid, boolean)',
    'public.business_set_member_role(bigint, uuid, text)',
    'public.business_remove_member(bigint, uuid)',
    'public.business_save_offer(bigint, jsonb, uuid)',
    'public.business_offer_action(uuid, text)',
    'public.business_offers(bigint)',
    'public.business_save_event(bigint, jsonb, date[], bigint, text)',
    'public.business_delete_event(bigint, text)',
    'public.business_post_story(bigint, text, text, jsonb)',
    'public.business_delete_story(uuid)',
    'public.business_stories_overview(bigint)',
    'public.track_place_event(bigint, text, text, text)',
    'public.business_stats(bigint, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ─── Mejlen (görs en gång, när du skaffat Resend) ───────────────────────────
-- 1. Skapa ett konto på resend.com, lägg till domänen osterlenappen.se och gör det Resend ber om
--    hos din domänleverantör (några DNS-rader). Vänta tills Resend säger "Verified".
-- 2. Skapa en API-nyckel i Resend och spara den här (byt ut texten mellan apostroferna):
--      select vault.create_secret('re_DIN_NYCKEL', 'resend_api_key');
-- 3. Klart. Från och med nu kan företag få sin kod till sin e-post.
--
-- Göra dig själv till admin (en gång, byt ut e-postadressen):
--      insert into public.user_roles (user_id, role)
--      select id, 'admin' from auth.users where email = 'DIN-EPOST'
--      on conflict do nothing;
