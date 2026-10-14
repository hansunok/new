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
