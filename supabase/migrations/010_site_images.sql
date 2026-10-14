-- 사이트 이미지(프로필 사진, 히어로 사진): 공개 버킷 site-images, 경로 <artist_id>/<파일명>
insert into storage.buckets (id, name, public) values ('site-images', 'site-images', true)
on conflict (id) do nothing;

create policy site_images_owner on storage.objects for all to authenticated
  using (bucket_id = 'site-images' and (storage.foldername(name))[1] = my_artist_id()::text)
  with check (bucket_id = 'site-images' and (storage.foldername(name))[1] = my_artist_id()::text);
