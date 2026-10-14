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
