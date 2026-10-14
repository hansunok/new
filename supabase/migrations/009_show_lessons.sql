-- 홈페이지 '레슨 안내' 영역 표시 여부
alter table site_settings add column if not exists show_lessons boolean not null default true;
notify pgrst, 'reload schema';
