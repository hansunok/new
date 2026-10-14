-- 개인레슨 아티스트 홈페이지 및 레슨 관리 프로그램 스키마
-- Supabase SQL Editor에서 실행하세요.

create extension if not exists "pgcrypto";

-- 아티스트(운영자). auth.users 1명 = 아티스트 1명
create table artists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- 수강생
create table students (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- 수강생 로그인 연결(6단계)
  name text not null,
  phone text,
  email text,
  guardian_name text,
  guardian_phone text,
  subject text,
  level text,
  goal text,
  source text,                         -- 유입 경로
  notes text,                          -- 특이사항
  status text not null default 'active' check (status in ('active','paused','left')),
  created_at timestamptz not null default now()
);

-- 레슨 신청/상담 접수 (홈페이지 폼 → 익명 INSERT 허용)
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  name text not null,
  contact text not null,
  subject text,
  available_time text,
  level text,
  message text,
  kind text not null default 'inquiry' check (kind in ('inquiry','consult','trial')),
  status text not null default 'new' check (status in ('new','contacted','enrolled','closed')),
  student_id uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 수강권: 회차권(sessions) 또는 월 단위(monthly)
create table passes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  type text not null check (type in ('sessions','monthly')),
  total_sessions int,
  valid_from date not null default current_date,
  valid_until date,
  price int not null default 0,
  created_at timestamptz not null default now()
);

-- 일정(수업)
create table lessons (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  pass_id uuid references passes(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  kind text not null default 'regular' check (kind in ('regular','once','makeup','trial')),
  status text not null default 'scheduled'
    check (status in ('scheduled','attended','late','absent','cancelled','rescheduled')),
  makeup_of uuid references lessons(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- 수강권 차감 이력 (잔여 횟수는 이 테이블에서 계산 → 변경/취소 후에도 이력 보존)
create table pass_usages (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references passes(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null,
  delta int not null,                  -- 차감 -1, 복구 +1, 수동 조정 ±n
  reason text,
  created_at timestamptz not null default now()
);

create view pass_balance as
  select p.id as pass_id, p.student_id,
         coalesce(p.total_sessions,0) + coalesce(sum(u.delta),0) as remaining
  from passes p left join pass_usages u on u.pass_id = p.id
  group by p.id;

-- 결제: 수정 대신 이력 테이블에 변경 전 기록 보관
create table payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  pass_id uuid references passes(id) on delete set null,
  amount int not null,
  kind text not null default 'payment' check (kind in ('payment','refund')),
  status text not null default 'pending' check (status in ('pending','paid','overdue','refunded')),
  due_date date,
  paid_at timestamptz,
  receipt_note text,
  created_at timestamptz not null default now()
);

create table payment_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  old_row jsonb not null,
  changed_at timestamptz not null default now()
);

create function log_payment_change() returns trigger language plpgsql as $$
begin
  insert into payment_history(payment_id, old_row) values (old.id, to_jsonb(old));
  return new;
end $$;
create trigger payments_audit before update on payments
  for each row execute function log_payment_change();

-- 레슨 기록
create table lesson_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  content text,
  homework text,
  next_plan text,
  feedback text,
  shared boolean not null default false,   -- true면 수강생/보호자에게 공개
  created_at timestamptz not null default now()
);

-- 첨부 파일: Storage 버킷 'lesson-files' (private), DB에는 경로만 저장
create table attachments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  lesson_note_id uuid references lesson_notes(id) on delete cascade,
  path text not null,
  mime text,
  size_bytes int,
  created_at timestamptz not null default now()
);

-- 공지·후기·포트폴리오 (공개 페이지용)
create table announcements (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  body text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  author text not null,
  body text not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== RLS =====
create function my_artist_id() returns uuid language sql stable security definer as $$
  select id from artists where owner_id = auth.uid()
$$;

alter table artists enable row level security;
alter table students enable row level security;
alter table inquiries enable row level security;
alter table consultations enable row level security;
alter table passes enable row level security;
alter table lessons enable row level security;
alter table pass_usages enable row level security;
alter table payments enable row level security;
alter table payment_history enable row level security;
alter table lesson_notes enable row level security;
alter table attachments enable row level security;
alter table announcements enable row level security;
alter table reviews enable row level security;

create policy artists_owner on artists for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy artists_public_read on artists for select using (true);

create policy students_owner on students for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy students_self on students for select using (user_id = auth.uid());

-- 익명 신청: 신규 상태로만 INSERT 가능, 조회는 아티스트만
create policy inquiries_insert_anon on inquiries for insert to anon, authenticated
  with check (status = 'new' and student_id is null);
create policy inquiries_owner on inquiries for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());

create policy consultations_owner on consultations for all
  using (student_id in (select id from students where artist_id = my_artist_id()))
  with check (student_id in (select id from students where artist_id = my_artist_id()));

create policy passes_owner on passes for all
  using (student_id in (select id from students where artist_id = my_artist_id()))
  with check (student_id in (select id from students where artist_id = my_artist_id()));
create policy passes_self on passes for select
  using (student_id in (select id from students where user_id = auth.uid()));

create policy lessons_owner on lessons for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy lessons_self on lessons for select
  using (student_id in (select id from students where user_id = auth.uid()));

create policy usages_owner on pass_usages for all
  using (pass_id in (select p.id from passes p join students s on s.id = p.student_id where s.artist_id = my_artist_id()))
  with check (pass_id in (select p.id from passes p join students s on s.id = p.student_id where s.artist_id = my_artist_id()));
create policy usages_self on pass_usages for select
  using (pass_id in (select p.id from passes p join students s on s.id = p.student_id where s.user_id = auth.uid()));

create policy payments_owner on payments for all
  using (student_id in (select id from students where artist_id = my_artist_id()))
  with check (student_id in (select id from students where artist_id = my_artist_id()));
create policy payments_self on payments for select
  using (student_id in (select id from students where user_id = auth.uid()));
create policy payment_history_owner on payment_history for select
  using (payment_id in (select pm.id from payments pm join students s on s.id = pm.student_id where s.artist_id = my_artist_id()));

create policy notes_owner on lesson_notes for all
  using (lesson_id in (select id from lessons where artist_id = my_artist_id()))
  with check (lesson_id in (select id from lessons where artist_id = my_artist_id()));
create policy notes_self on lesson_notes for select
  using (shared and lesson_id in (select l.id from lessons l join students s on s.id = l.student_id where s.user_id = auth.uid()));

create policy attachments_owner on attachments for all
  using (student_id in (select id from students where artist_id = my_artist_id()))
  with check (student_id in (select id from students where artist_id = my_artist_id()));

create policy announcements_public on announcements for select using (published);
create policy announcements_owner on announcements for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy reviews_public on reviews for select using (published);
create policy reviews_owner on reviews for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());

-- ===== 학교·학년 이력 =====
-- 수강생 학교·학년 이력. 이미 schema.sql을 실행한 DB에는 이 파일만 실행하세요.
create table student_schools (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  school_name text not null,
  grade text not null,                       -- 예: 초5, 중2, 고3, 대1
  started_on date not null default current_date,
  ended_on date,                             -- null = 현재
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
-- 학생당 '현재' 기록은 하나만
create unique index student_schools_one_current on student_schools(student_id) where ended_on is null;

alter table student_schools enable row level security;
create policy student_schools_owner on student_schools for all
  using (student_id in (select id from students where artist_id = my_artist_id()))
  with check (student_id in (select id from students where artist_id = my_artist_id()));
create policy student_schools_self on student_schools for select
  using (student_id in (select id from students where user_id = auth.uid()));

-- ===== 공연·영상·설정·발송 =====
-- 공연 정보, 유튜브 영상, 신청 영역 on/off, 지인 연락처, 발송 이력

-- 사이트 설정 (행이 없으면 모두 기본값 = 신청 받기 켜짐)
create table site_settings (
  artist_id uuid primary key references artists(id) on delete cascade,
  apply_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  venue text,
  description text,
  link_url text,                         -- 예매/안내 링크
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  youtube_url text not null,
  description text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- 수강생·보호자 외 지인 연락처
create table contacts (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  name text not null,
  phone text not null,
  relation text,
  created_at timestamptz not null default now()
);

create table message_logs (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  channel text not null default 'sms' check (channel in ('sms','kakao')),
  body text not null,
  recipients jsonb not null,             -- [{name, phone}]
  status text not null check (status in ('sent','partial','failed')),
  result jsonb,
  created_at timestamptz not null default now()
);

alter table site_settings enable row level security;
alter table events enable row level security;
alter table videos enable row level security;
alter table contacts enable row level security;
alter table message_logs enable row level security;

create policy settings_public on site_settings for select using (true);
create policy settings_owner on site_settings for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy events_public on events for select using (published);
create policy events_owner on events for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy videos_public on videos for select using (published);
create policy videos_owner on videos for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy contacts_owner on contacts for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());
create policy message_logs_owner on message_logs for all
  using (artist_id = my_artist_id()) with check (artist_id = my_artist_id());

-- 신청 받기를 끄면 DB에서도 익명 신청을 막는다 (화면 숨김만으로 우회되지 않도록)
drop policy inquiries_insert_anon on inquiries;
create policy inquiries_insert_anon on inquiries for insert to anon, authenticated
  with check (
    status = 'new' and student_id is null
    and not exists (select 1 from site_settings s where s.artist_id = inquiries.artist_id and not s.apply_enabled)
  );

-- ===== 공연 포스터 =====
-- 공연 포스터 이미지: 공개 버킷 event-images, 경로는 <artist_id>/<파일명>
alter table events add column image_path text;

insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy event_images_owner on storage.objects for all to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = my_artist_id()::text)
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = my_artist_id()::text);

-- ===== 공지·후기 영역 표시 =====
-- 홈페이지 공지 / 수강 후기 영역 표시 여부
alter table site_settings
  add column show_notices boolean not null default true,
  add column show_reviews boolean not null default true;

-- ===== 멀티 아티스트 =====
-- 여러 아티스트: 사이트 내용을 DB로 옮기고, 공개 조회는 필요한 컬럼만 노출
alter table artists add column if not exists profile jsonb not null default '{}'::jsonb;

-- 주소(slug): 영문 소문자·숫자·하이픈 3~30자, 예약어 제외
alter table artists add constraint artists_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{2,29}$' and slug not in ('admin','api','www','event','signup','static'));

-- 공개 홈페이지용 뷰 (owner_id 등 내부 컬럼은 노출하지 않음)
create view artist_sites as select id, slug, name, profile from artists;
grant select on artist_sites to anon, authenticated;

-- artists 테이블 전체 공개 조회는 중단 (본인 행은 artists_owner 정책으로 계속 접근)
drop policy if exists artists_public_read on artists;

-- ===== 아티스트 승인제 =====
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

-- ===== 공개 조회 범위 =====
-- 공개 조회는 '승인된 아티스트의 공개 항목'으로 한정 (다른 아티스트·미승인 아티스트 데이터 노출 방지)
drop policy events_public on events;
create policy events_public on events for select
  using (published and artist_is_approved(artist_id));

drop policy videos_public on videos;
create policy videos_public on videos for select
  using (published and artist_is_approved(artist_id));

drop policy announcements_public on announcements;
create policy announcements_public on announcements for select
  using (published and artist_is_approved(artist_id));

drop policy reviews_public on reviews;
create policy reviews_public on reviews for select
  using (published and artist_is_approved(artist_id));

drop policy settings_public on site_settings;
create policy settings_public on site_settings for select
  using (artist_is_approved(artist_id));

-- ===== 레슨 안내 영역 표시 =====
-- 홈페이지 '레슨 안내' 영역 표시 여부
alter table site_settings add column if not exists show_lessons boolean not null default true;
notify pgrst, 'reload schema';

-- ===== 사이트 이미지 =====
-- 사이트 이미지(프로필 사진, 히어로 사진): 공개 버킷 site-images, 경로 <artist_id>/<파일명>
insert into storage.buckets (id, name, public) values ('site-images', 'site-images', true)
on conflict (id) do nothing;

create policy site_images_owner on storage.objects for all to authenticated
  using (bucket_id = 'site-images' and (storage.foldername(name))[1] = my_artist_id()::text)
  with check (bucket_id = 'site-images' and (storage.foldername(name))[1] = my_artist_id()::text);
