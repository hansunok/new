-- 공연 포스터 이미지: 공개 버킷 event-images, 경로는 <artist_id>/<파일명>
alter table events add column image_path text;

insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy event_images_owner on storage.objects for all to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = my_artist_id()::text)
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = my_artist_id()::text);
