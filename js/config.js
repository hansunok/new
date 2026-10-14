// 사이트 설정. Supabase 값을 채우면 신청이 DB에 저장됩니다.
// (anon key는 공개되어도 되는 키이며, 접근 제어는 RLS가 담당합니다.)
window.SITE = {
  supabaseUrl: "https://jpfpgxzvraqkaithpant.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZnBneHp2cmFxa2FpdGhwYW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODk0NDgsImV4cCI6MjEwNzM2NTQ0OH0.SMo5wziMBPWcjBZOu4HW7HCRZ47tnjM7fJnwlTYEJ3w",
  artistSlug: "my-artist",   // 주소에 ?a=아이디 가 없을 때 보여줄 기본 아티스트
  siteUrl: "https://hansunok.github.io/new/",   // 배포된 홈페이지 주소 (문자 속 링크용). 비우면 현재 주소 기준
};
