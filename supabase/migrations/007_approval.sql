-- 아티스트 승인제: 가입 = 승인 대기, 플랫폼 관리자가 승인해야 사이트 공개·기능 사용 가능
alter table artists add column status text not null default 'pending'
  check (status in ('pending','approved','suspended'));
update artists set status = 'approved';          -- 기존 아티스트는 승인 처리

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table platform_admins enable row level security;
create policy platform_admins_self on platform_admins for select using (user_id = auth.uid());

create function is_platform_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create function artist_is_approved(aid uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from artists where id = aid and status = 'approved')
$$;

-- 승인된 아티스트만 업무 데이터 접근 (모든 RLS 정책이 my_artist_id()를 사용)
create or replace function my_artist_id() returns uuid language sql stable security definer as $$
  select id from artists where owner_id = auth.uid() and status = 'approved'
$$;

-- 스스로 승인/소유자 변경 방지
create function artists_guard() returns trigger language plpgsql security definer as $$
begin
  if not is_platform_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    else
      new.status := old.status;
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end $$;
create trigger artists_guard_trg before insert or update on artists
  for each row execute function artists_guard();

create policy artists_platform_admin on artists for all
  using (is_platform_admin()) with check (is_platform_admin());

-- 공개 조회는 승인된 아티스트만
create or replace view artist_sites as
  select id, slug, name, profile from artists where status = 'approved';

-- 승인 전/정지된 아티스트의 홈페이지에는 신청 접수 불가
drop policy inquiries_insert_anon on inquiries;
create policy inquiries_insert_anon on inquiries for insert to anon, authenticated
  with check (
    status = 'new' and student_id is null and artist_is_approved(artist_id)
    and not exists (select 1 from site_settings s where s.artist_id = inquiries.artist_id and not s.apply_enabled)
  );

-- 플랫폼 관리자용 아티스트 목록 (가입 이메일 포함)
create function platform_artists()
returns table (id uuid, name text, slug text, status text, created_at timestamptz, email text)
language plpgsql stable security definer as $$
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  return query
    select a.id, a.name, a.slug, a.status, a.created_at, u.email::text
    from artists a join auth.users u on u.id = a.owner_id
    order by (a.status = 'pending') desc, a.created_at desc;
end $$;
revoke execute on function platform_artists() from anon;
