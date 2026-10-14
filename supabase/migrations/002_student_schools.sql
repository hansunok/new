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
