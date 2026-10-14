// 새 아티스트의 기본 사이트 내용. 아티스트가 관리자 > 사이트 정보에서 자신의 내용으로 바꿉니다.
window.DEFAULT_PROFILE = {
  englishName: "",
  nickname: "",
  nameDisplay: "english",   // 이름 표기: "english" | "korean" (영문 이름이 없으면 항상 한글)
  images: {},            // { photo, hero1, hero2 } — 스토리지 경로
  tagline: "1:1 개인 레슨",
  field: "",
  intro: "",
  philosophy: "",
  career: [],
  lessons: [],
  subjects: [],
  contact: { kakao: "", email: "", phone: "" }
};
// 저장된 profile과 기본값을 합쳐 항상 같은 모양으로 쓴다
window.mergeProfile = (p) => {
  const d = window.DEFAULT_PROFILE, x = p || {};
  return { ...d, ...x, career: x.career || d.career, lessons: x.lessons || d.lessons,
    subjects: x.subjects || d.subjects, contact: { ...d.contact, ...(x.contact || {}) }, images: { ...(x.images || {}) } };
};
// slug 규칙 (DB 제약과 동일)
window.SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
window.RESERVED_SLUGS = ["admin", "api", "www", "event", "signup", "static"];
