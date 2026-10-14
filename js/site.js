(function () {
  const S = window.SITE;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  };
  const db = S.supabaseUrl && S.supabaseAnonKey
    ? supabase.createClient(S.supabaseUrl, S.supabaseAnonKey) : null;

  const slug = new URLSearchParams(location.search).get("a") || S.artistSlug;
  let P = window.mergeProfile({});   // 현재 아티스트의 사이트 내용

  // 히어로 사진 (hero1이 먼저 보이다가 hero2로 서서히 바뀐다)
  const siteImg = (path) => (db && path ? db.storage.from("site-images").getPublicUrl(path).data.publicUrl : "");
  const preload = (u) => (u ? new Promise((done) => { const i = new Image(); i.onload = i.onerror = done; i.src = u; setTimeout(done, 5000); }) : Promise.resolve());
  let heroReady = Promise.resolve();
  const setReady = () => document.documentElement.classList.add("ready");
  setTimeout(setReady, 6000);   // 어떤 경우에도 화면이 멈춰 있지 않도록 하는 안전장치
  async function renderImages() {
    const im = P.images, hero = $("top"), turn = $("heroTurn");
    const h1 = siteImg(im.hero1), h2 = siteImg(im.hero2);
    await Promise.all([preload(h1), preload(h2)]);   // 사진을 다 받은 뒤 한 번에 적용
    const base = h2 || h1;
    hero.classList.toggle("has-photo", !!base);
    hero.style.backgroundImage = base ? `url("${base}")` : "";
    turn.hidden = !(h1 && h2);
    turn.style.backgroundImage = h1 && h2 ? `url("${h1}")` : "";
  }

  // 아티스트 프로필을 화면에 채운다
  function renderProfile(name) {
    // 이름 표기: 관리자가 영문/한글 중 선택 (영문 이름이 비어 있으면 한글)
    const display = P.nameDisplay === "korean" || !P.englishName ? name : P.englishName;
    document.title = display;
    ["logo", "heroName", "footName"].forEach((id) => ($(id).textContent = display));
    $("heroSub").textContent = P.nickname; $("heroSub").hidden = !P.nickname;
    heroReady = renderImages();
    $("heroTag").textContent = P.tagline;
    $("heroField").textContent = P.field;
    $("heroField").hidden = !P.field;
    $("field").textContent = P.field; $("field").hidden = !P.field;
    $("intro").textContent = P.intro;
    $("philosophy").textContent = P.philosophy;
    $("year").textContent = new Date().getFullYear();
    $("career").replaceChildren(...P.career.map((c) => el("li", { textContent: c })));
    $("aboutCareer").hidden = !P.career.length;
    $("aboutPhil").hidden = !P.philosophy;

    $("lessonCards").replaceChildren(...P.lessons.map((l) => {
      const rows = [["대상", l.target], ["방식", l.format], ["시간", l.time], ["장소", l.place], ["수강료", l.price]].filter(([, v]) => v);
      const dl = el("dl");
      rows.forEach(([k, v]) => dl.append(el("dt", { textContent: k }), el("dd", { textContent: v })));
      return el("div", { className: "card" }, el("h3", { textContent: l.subject }), dl);
    }));
    $("lessons").hidden = !P.lessons.length;
    document.querySelectorAll('a[href="#lessons"]').forEach((a) => (a.hidden = !P.lessons.length));

    $("subjectSelect").replaceChildren(...(P.subjects.length ? P.subjects : ["기타"]).map((s) => el("option", { textContent: s })));

    const c = P.contact;
    // 상단 Contact 메뉴: 관리자에 등록된 이메일로 연결 (이메일이 없으면 숨김)
    const mail = /^[^\s@<>"]+@[^\s@<>"]+$/.test(c.email || "");
    $("navContact").hidden = !mail;
    if (mail) $("navContact").href = "mailto:" + c.email;
    $("contactLinks").replaceChildren(...[["카카오톡", c.kakao], ["이메일", c.email && "mailto:" + c.email], ["전화", c.phone && "tel:" + c.phone.replace(/-/g, "")]]
      .filter(([, href]) => href && /^(https?:|mailto:|tel:)/i.test(href))
      .map(([label, href]) => el("a", { href, textContent: label, target: "_blank", rel: "noopener" })));
  }
  renderProfile("");

  // 유튜브 주소(watch, youtu.be, shorts, embed, live) → 영상 ID
  const ytId = (url) => { const m = String(url).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/); return m && m[1]; };
  const card = (media, title, desc) => el("div", { className: "card" }, media, el("h3", { textContent: title }), desc ? el("p", { className: "muted", textContent: desc }) : "");

  // 공지·후기 (Supabase 연결 시)
  const imgUrl = (path) => db.storage.from("event-images").getPublicUrl(path).data.publicUrl;

  // 공연 영상: 2줄까지만 보이고 나머지는 더보기 (줄당 개수는 화면 폭에 따라 달라짐)
  let videosExpanded = false;
  function applyVideoFold() {
    const list = $("portfolioList");
    const cards = [...list.children].filter((c) => c.classList.contains("card"));
    const cols = getComputedStyle(list).gridTemplateColumns.split(" ").length || 1;
    const limit = cols * 2;
    cards.forEach((c, i) => (c.hidden = !videosExpanded && i >= limit));
    $("videoMore").hidden = cards.length <= limit;
    $("videoMore").textContent = videosExpanded ? "접기" : `더보기 (${cards.length - limit})`;
  }
  $("videoMore").addEventListener("click", () => { videosExpanded = !videosExpanded; applyVideoFold(); });
  window.addEventListener("resize", applyVideoFold);

  // 수강 신청 영역 숨김 (관리자 설정)
  function hideApply() {
    $("apply").hidden = true;
    document.querySelectorAll('a[href="#apply"]').forEach((a) => (a.hidden = true));
  }

  // 없는 주소: 빈 페이지 대신 안내만 표시
  function notFound() {
    document.body.replaceChildren(el("main", { className: "wrap", style: "text-align:center" },
      el("h1", { textContent: "존재하지 않는 사이트입니다" }),
      el("p", { className: "muted", textContent: `주소(${slug})를 확인해 주세요.` })));
  }

  async function loadPublic() {
    if (!db) return setReady();
    const { data: artist } = await db.from("artist_sites").select("id,name,profile").eq("slug", slug).maybeSingle();
    if (!artist) return notFound();
    S.artistId = artist.id;
    P = window.mergeProfile(artist.profile);
    renderProfile(artist.name);
    await heroReady;
    setReady();
    const [st, ev, vd] = await Promise.all([
      db.from("site_settings").select("*").eq("artist_id", artist.id).maybeSingle(),
      db.from("events").select("id,title,starts_at,venue,description,link_url,image_path").eq("artist_id", artist.id).eq("published", true)
        .gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(20),
      db.from("videos").select("title,youtube_url,description").eq("artist_id", artist.id).eq("published", true).order("sort_order").order("created_at", { ascending: false }).limit(100)
    ]);
    if (st.data && st.data.apply_enabled === false) hideApply();
    if (ev.data && ev.data.length) $("eventList").replaceChildren(...ev.data.map((x) => {
      const when = new Date(x.starts_at).toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" });
      const item = el("div", { className: "item" }, el("strong", { textContent: x.title }),
        el("div", { className: "muted", textContent: [when, x.venue].filter(Boolean).join(" · ") }));
      if (x.image_path) item.append(el("img", { src: imgUrl(x.image_path), alt: x.title, loading: "lazy", style: "max-width:320px;width:100%;border-radius:8px;display:block;margin:8px 0" }));
      if (x.description) item.append(el("p", { textContent: x.description }));
      if (x.link_url && /^https?:\/\//i.test(x.link_url)) item.append(el("a", { href: x.link_url, target: "_blank", rel: "noopener", textContent: "자세히 보기" }));
      return item;
    }));
    (vd.data || []).forEach((v) => {
      const id = ytId(v.youtube_url);
      if (!id) return;
      $("portfolioList").append(card(el("iframe", {
        src: "https://www.youtube-nocookie.com/embed/" + id, title: v.title, allowFullscreen: true, loading: "lazy"
      }), v.title, v.description));
    });
    // 데이터가 없으면 영역과 메뉴를 모두 숨긴다
    const hasEvents = !!(ev.data && ev.data.length), hasVideos = !!$("portfolioList").children.length;
    [["events", hasEvents], ["portfolio", hasVideos]].forEach(([id, on]) => {
      $(id).hidden = !on;
      document.querySelectorAll(`a[href="#${id}"]`).forEach((a) => (a.hidden = !on));
    });
    applyVideoFold();
    const [n, r] = await Promise.all([
      db.from("announcements").select("title,body,created_at").eq("artist_id", artist.id).eq("published", true).order("created_at", { ascending: false }).limit(10),
      db.from("reviews").select("author,body").eq("artist_id", artist.id).eq("published", true).order("created_at", { ascending: false }).limit(10)
    ]);
    // 공지·후기: 관리자가 영역을 켜 두었고 공개된 글이 있을 때만 영역 자체를 표시
    const cfg = st.data || {};
    const showLessons = cfg.show_lessons !== false && P.lessons.length > 0;
    $("lessons").hidden = !showLessons;
    document.querySelectorAll('a[href="#lessons"]').forEach((a) => (a.hidden = !showLessons));
    const show = (box, on, rows, target, fn) => {
      const visible = on !== false && rows && rows.length;
      box.hidden = !visible;
      if (visible) target.replaceChildren(...rows.map(fn));
      return visible;
    };
    const a1 = show($("noticeBox"), cfg.show_notices, n.data, $("noticeList"),
      (x) => el("div", { className: "item" }, el("strong", { textContent: x.title }), el("p", { textContent: x.body || "", style: "white-space:pre-wrap" })));
    const a2 = show($("reviewBox"), cfg.show_reviews, r.data, $("reviewList"),
      (x) => el("div", { className: "item" }, el("p", { textContent: x.body }), el("small", { className: "muted", textContent: "— " + x.author })));
    $("notices").hidden = !(a1 || a2);
    $("navNotices").hidden = !(a1 || a2);
  }
  loadPublic();

  // 헤더: 스크롤하면 흰색 배경, 모바일 메뉴 토글
  const header = $("siteHeader"), toggle = $("menuToggle"), nav = $("siteNav");
  const updateHeader = () => header.classList.toggle("is-solid", window.scrollY > 40);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    toggle.textContent = open ? "×" : "☰";
  };
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  $("applyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, msg = $("applyMsg"), btn = f.querySelector("button");
    const d = Object.fromEntries(new FormData(f));
    delete d.agree;
    btn.disabled = true; msg.textContent = "전송 중...";
    try {
      if (!db) throw new Error("서버(Supabase)가 아직 연결되지 않았습니다. js/config.js를 설정해 주세요.");
      if (!S.artistId) await loadPublic();
      if (!S.artistId) throw new Error("아티스트 정보를 찾을 수 없습니다.");
      const { error } = await db.from("inquiries").insert({ ...d, artist_id: S.artistId });
      if (error) throw error;
      msg.textContent = "신청이 접수되었습니다. 확인 후 연락드리겠습니다.";
      f.reset();
    } catch (err) {
      msg.textContent = "전송 실패: " + (err.message || err);
    } finally { btn.disabled = false; }
  });
})();
