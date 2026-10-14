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
