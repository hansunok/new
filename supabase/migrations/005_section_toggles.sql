-- 홈페이지 공지 / 수강 후기 영역 표시 여부
alter table site_settings
  add column show_notices boolean not null default true,
  add column show_reviews boolean not null default true;
