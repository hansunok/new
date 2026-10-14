// 관리자: 공연 · 영상 · 메시지 발송 · 홈페이지 설정
window.initContent = function ({ db, artistId, artist, $, el, getStudents }) {
  const S = window.SITE;
  const imgUrl = (path) => db.storage.from("event-images").getPublicUrl(path).data.publicUrl;
  // 업로드 전 가로 최대 1280px JPEG로 줄여 저장·전송 용량을 아낀다
  async function shrink(file, max = 1280) {
    const bmp = await createImageBitmap(file);
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  }
  let editingImage = null;
  const showEventImg = (path) => $("eventImgPreview").replaceChildren(...(path ? [el("img", { src: imgUrl(path), alt: "포스터", width: 120 })] : []));
  const ytId = (url) => { const m = String(url).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/); return m && m[1]; };
  const toLocalInput = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  const btn = (text, fn) => { const b = el("button", { className: "btn small ghost", textContent: text, type: "button" }); b.addEventListener("click", fn); return b; };
  const fail = (error) => { if (error) { alert(error.message); return true; } };

  // ---------- 공연 ----------
  let events = [];
  async function loadEvents() {
    const { data, error } = await db.from("events").select("*").eq("artist_id", artistId).order("starts_at", { ascending: false });
    if (fail(error)) return;
    events = data;
    $("eventBody").replaceChildren(...events.map((x) => el("tr", {},
      el("td", { textContent: fmt(x.starts_at) }), el("td", { textContent: x.title }),
      el("td", { textContent: x.venue || "" }), el("td", { textContent: x.published ? "공개" : "비공개" }),
      el("td", {},
        btn("수정", () => {
          const f = $("eventForm").elements;
          f.id.value = x.id; f.title.value = x.title; f.starts_at.value = toLocalInput(x.starts_at);
          f.venue.value = x.venue || ""; f.link_url.value = x.link_url || ""; f.description.value = x.description || "";
          f.published.checked = x.published; editingImage = x.image_path; showEventImg(x.image_path);
          $("eventForm").scrollIntoView({ behavior: "smooth" });
        }), " ",
        btn("삭제", async () => {
          if (!confirm(`'${x.title}' 공연을 삭제할까요?`)) return;
          if (fail((await db.from("events").delete().eq("id", x.id)).error)) return;
          if (x.image_path) await db.storage.from("event-images").remove([x.image_path]);
          loadEvents();
        })))));
    $("eventPick").replaceChildren(el("option", { value: "", textContent: "공연 선택 (선택 안 하면 추가 내용만 발송)" }),
      ...events.filter((x) => new Date(x.starts_at) > new Date()).reverse()
        .map((x) => el("option", { value: x.id, textContent: `${fmt(x.starts_at)} ${x.title}` })));
    renderPreview();
  }
  $("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    let image_path = editingImage;
    const file = f.image.files[0];
    if (file) {
      try {
        const blob = await shrink(file);
        const path = `${artistId}/${crypto.randomUUID()}.jpg`;
        const up = await db.storage.from("event-images").upload(path, blob, { contentType: "image/jpeg" });
        if (fail(up.error)) return;
        if (editingImage) await db.storage.from("event-images").remove([editingImage]);
        image_path = path;
      } catch { return alert("이미지를 처리하지 못했습니다. 다른 파일을 선택해 주세요."); }
    }
    const row = {
      image_path, title: f.title.value.trim(), starts_at: new Date(f.starts_at.value).toISOString(),
      venue: f.venue.value.trim() || null, link_url: f.link_url.value.trim() || null,
      description: f.description.value.trim() || null, published: f.published.checked
    };
    const { error } = f.id.value
      ? await db.from("events").update(row).eq("id", f.id.value)
      : await db.from("events").insert({ ...row, artist_id: artistId });
    if (fail(error)) return;
    e.target.reset(); f.id.value = ""; f.published.checked = true; editingImage = null; showEventImg(null); loadEvents();
  });
  $("eventReset").addEventListener("click", () => { $("eventForm").reset(); $("eventForm").elements.id.value = ""; editingImage = null; showEventImg(null); });

  // ---------- 유튜브 영상 ----------
  async function loadVideos() {
    const { data, error } = await db.from("videos").select("*").eq("artist_id", artistId).order("sort_order").order("created_at", { ascending: false });
    if (fail(error)) return;
    $("videoBody").replaceChildren(...data.map((v) => {
      const id = ytId(v.youtube_url);
      return el("tr", {},
        el("td", {}, id ? el("img", { src: `https://img.youtube.com/vi/${id}/default.jpg`, alt: "", width: 80 }) : "주소 오류"),
        el("td", { textContent: v.title }), el("td", { textContent: v.sort_order }),
        el("td", { textContent: v.published ? "공개" : "비공개" }),
        el("td", {},
          btn("수정", () => {
            const f = $("videoForm").elements;
            f.id.value = v.id; f.title.value = v.title; f.youtube_url.value = v.youtube_url;
            f.sort_order.value = v.sort_order; f.description.value = v.description || ""; f.published.checked = v.published;
            $("videoForm").scrollIntoView({ behavior: "smooth" });
          }), " ",
          btn("삭제", async () => {
            if (!confirm(`'${v.title}' 영상을 삭제할까요?`)) return;
            if (!fail((await db.from("videos").delete().eq("id", v.id)).error)) loadVideos();
          })));
    }));
  }
  $("videoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (!ytId(f.youtube_url.value)) return alert("유튜브 주소를 확인해 주세요. (watch?v=…, youtu.be/…, shorts/… 형식)");
    const row = {
      title: f.title.value.trim(), youtube_url: f.youtube_url.value.trim(), sort_order: +f.sort_order.value || 0,
      description: f.description.value.trim() || null, published: f.published.checked
    };
    const { error } = f.id.value
      ? await db.from("videos").update(row).eq("id", f.id.value)
      : await db.from("videos").insert({ ...row, artist_id: artistId });
    if (fail(error)) return;
    e.target.reset(); f.id.value = ""; f.sort_order.value = 0; f.published.checked = true; loadVideos();
  });
  $("videoReset").addEventListener("click", () => { $("videoForm").reset(); $("videoForm").elements.id.value = ""; });

  // ---------- 공지 · 후기 (공개 여부를 관리자가 결정) ----------
  // table: 테이블명, form/body: 요소 id, cols: 목록에 보여줄 [필드, 제한 길이]
  function manage({ table, form, bodyId, reset, order, cols, label }) {
    const F = () => $(form).elements;
    async function load() {
      const { data, error } = await db.from(table).select("*").eq("artist_id", artistId).order("created_at", { ascending: order });
      if (fail(error)) return;
      $(bodyId).replaceChildren(...data.map((x) => {
        const pub = el("input", { type: "checkbox", checked: x.published, title: "홈페이지 공개" });
        pub.addEventListener("change", async () => {
          if (fail((await db.from(table).update({ published: pub.checked }).eq("id", x.id)).error)) pub.checked = !pub.checked;
        });
        return el("tr", {},
          el("td", { textContent: new Date(x.created_at).toLocaleDateString("ko-KR") }),
          ...cols.map(([k, n]) => el("td", { textContent: String(x[k] || "").slice(0, n) })),
          el("td", {}, pub),
          el("td", {},
            btn("수정", () => {
              Object.keys(x).forEach((k) => { const f = F()[k]; if (!f) return; if (f.type === "checkbox") f.checked = !!x[k]; else f.value = x[k] ?? ""; });
              $(form).scrollIntoView({ behavior: "smooth" });
            }), " ",
            btn("삭제", async () => {
              if (!confirm(`이 ${label}을(를) 삭제할까요?`)) return;
              if (!fail((await db.from(table).delete().eq("id", x.id)).error)) load();
            })));
      }));
    }
    $(form).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = F(), row = {};
      Array.from(f).forEach((i) => { if (i.name && i.name !== "id") row[i.name] = i.type === "checkbox" ? i.checked : i.value.trim(); });
      const { error } = f.id.value
        ? await db.from(table).update(row).eq("id", f.id.value)
        : await db.from(table).insert({ ...row, artist_id: artistId });
      if (fail(error)) return;
      resetForm(); load();
    });
    function resetForm() { $(form).reset(); F().id.value = ""; }
    $(reset).addEventListener("click", resetForm);
    load();
  }
  manage({ table: "announcements", form: "noticeForm", bodyId: "noticeBody", reset: "noticeReset", order: false, label: "공지", cols: [["title", 40]] });
  manage({ table: "reviews", form: "reviewForm", bodyId: "reviewBody", reset: "reviewReset", order: false, label: "후기", cols: [["author", 20], ["body", 60]] });

  // ---------- 홈페이지 설정 ----------
  const TOGGLES = { applyEnabled: ["apply_enabled", ["신청 영역을 표시합니다.", "신청 영역을 숨겼습니다."]],
    showLessons: ["show_lessons", ["레슨 안내 영역을 표시합니다.", "레슨 안내 영역을 숨겼습니다."]],
    showNotices: ["show_notices", ["공지 영역을 표시합니다.", "공지 영역을 숨겼습니다."]],
    showReviews: ["show_reviews", ["수강 후기 영역을 표시합니다.", "수강 후기 영역을 숨겼습니다."]] };
  async function loadSettings() {
    const { data, error } = await db.from("site_settings").select("*").eq("artist_id", artistId).maybeSingle();
    if (error) $("settingsMsg").textContent = "설정을 불러오지 못했습니다: " + error.message;
    Object.entries(TOGGLES).forEach(([id, [col]]) => ($(id).checked = data ? data[col] !== false : true));
  }
  Object.entries(TOGGLES).forEach(([id, [col, msgs]]) => $(id).addEventListener("change", async (e) => {
    const { error } = await db.from("site_settings").upsert(
      { artist_id: artistId, [col]: e.target.checked, updated_at: new Date().toISOString() });
    if (fail(error)) { e.target.checked = !e.target.checked; return; }
    $("settingsMsg").textContent = msgs[e.target.checked ? 0 : 1];
  }));

  // ---------- 메시지 발송 ----------
  const GRP = { student: "수강생", guardian: "보호자", contact: "지인" };
  let recipients = [], contacts = [];
  const normPhone = (p) => String(p || "").replace(/\D/g, "");
  const validPhone = (p) => /^01\d{8,9}$/.test(normPhone(p));

  async function loadContacts() {
    const { data } = await db.from("contacts").select("*").eq("artist_id", artistId).order("name");
    contacts = data || [];
    buildRecipients();
  }
  function buildRecipients() {
    const prev = new Set(recipients.filter((r) => r.on).map((r) => r.key));
    const first = !recipients.length;
    recipients = [];
    getStudents().filter((s) => s.status !== "left").forEach((s) => {
      if (s.phone) recipients.push({ key: "s" + s.id, grp: "student", name: s.name, phone: s.phone });
      if (s.guardian_phone) recipients.push({ key: "g" + s.id, grp: "guardian", name: `${s.name} 보호자${s.guardian_name ? "(" + s.guardian_name + ")" : ""}`, phone: s.guardian_phone });
    });
    contacts.forEach((c) => recipients.push({ key: "c" + c.id, grp: "contact", name: c.name + (c.relation ? ` (${c.relation})` : ""), phone: c.phone }));
    recipients.forEach((r) => (r.on = first ? false : prev.has(r.key)));
    renderRecipients();
  }
  const activeGroups = () => new Set([...document.querySelectorAll("#recipientFilters [data-grp]")].filter((c) => c.checked).map((c) => c.dataset.grp));
  function renderRecipients() {
    const groups = activeGroups();
    const shown = recipients.filter((r) => groups.has(r.grp));
    $("recipientList").replaceChildren(...(shown.length ? shown.map((r) => {
      const cb = el("input", { type: "checkbox", checked: r.on });
      cb.addEventListener("change", () => { r.on = cb.checked; updateInfo(); });
      const bad = !validPhone(r.phone);
      return el("label", { className: "check", style: "padding:2px 0" }, cb,
        el("span", { textContent: `[${GRP[r.grp]}] ${r.name} · ${r.phone}${bad ? " (번호 형식 확인)" : ""}`, style: bad ? "color:#b45309" : "" }));
    }) : [el("p", { className: "muted", textContent: "받는 사람이 없습니다. 수강생 전화번호나 지인 연락처를 등록하세요." })]));
    updateInfo();
  }
  // 선택된 수신자: 표시 중인 그룹 + 체크된 + 유효 번호 + 번호 중복 제거
  function selected() {
    const groups = activeGroups(), seen = new Set(), out = [];
    recipients.filter((r) => r.on && groups.has(r.grp) && validPhone(r.phone)).forEach((r) => {
      const p = normPhone(r.phone);
      if (!seen.has(p)) { seen.add(p); out.push({ name: r.name, phone: p }); }
    });
    return out;
  }
  const byteLen = (s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  const siteBase = () => (S.siteUrl ? S.siteUrl.replace(/\/?$/, "/") : new URL("../", location.href).href);
  const pickedEvent = () => events.find((v) => v.id === $("eventPick").value);

  // 실제로 발송되는 문구 (미리보기와 동일)
  function currentBody() {
    const x = pickedEvent(), extra = $("msgExtra").value.trim();
    const lines = [];
    if (x) lines.push(`[공연 안내] ${x.title}`, `일시: ${fmt(x.starts_at)}`);
    if (x && x.venue) lines.push(`장소: ${x.venue}`);
    if (extra) lines.push(...(x ? [""] : []), extra);
    if (x) lines.push("", `포스터·자세히 보기: ${siteBase()}event.html?id=${x.id}`);
    return lines.join(String.fromCharCode(10));
  }
  function renderPreview() {
    const x = pickedEvent(), body = currentBody();
    const kids = [];
    if (x && x.image_path) kids.push(el("img", { src: imgUrl(x.image_path), alt: x.title, style: "max-width:240px;width:100%;border-radius:8px;display:block;margin-bottom:8px" }));
    if (x && !x.image_path) kids.push(el("p", { className: "muted", textContent: "(포스터 이미지가 없는 공연입니다.)" }));
    kids.push(el("div", { textContent: body || "(내용이 없습니다)", style: "white-space:pre-wrap" }));
    if (x) kids.push(el("p", { className: "muted", textContent: "※ 문자에는 이미지가 직접 들어가지 않고, 위 링크를 열면 포스터가 보입니다." }));
    if (x && /localhost|127\.0\.0\.1/.test(siteBase())) kids.push(el("p", { style: "color:#b45309", textContent: "※ 링크가 로컬 주소입니다. 실제 발송 전에 js/config.js의 siteUrl에 배포된 홈페이지 주소를 넣어 주세요." }));
    $("msgPreview").replaceChildren(...kids);
    updateInfo();
  }
  function updateInfo() {
    const n = byteLen(currentBody());
    $("msgInfo").textContent = `선택 ${selected().length}명 · ${n}바이트 (${n > 90 ? "장문(LMS)" : "단문(SMS)"} — 90바이트 초과 시 LMS)`;
  }
  document.querySelectorAll("#recipientFilters [data-grp]").forEach((c) => c.addEventListener("change", renderRecipients));
  $("recAll").addEventListener("click", () => { const g = activeGroups(); recipients.forEach((r) => { if (g.has(r.grp)) r.on = true; }); renderRecipients(); });
  $("recNone").addEventListener("click", () => { recipients.forEach((r) => (r.on = false)); renderRecipients(); });
  $("msgExtra").addEventListener("input", renderPreview);
  $("eventPick").addEventListener("change", renderPreview);

  $("contactForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!validPhone(d.phone)) return alert("휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");
    const { error } = await db.from("contacts").insert({ artist_id: artistId, name: d.name.trim(), phone: d.phone.trim(), relation: d.relation.trim() || null });
    if (fail(error)) return;
    e.target.reset(); loadContacts();
  });

  // 복사/문자앱 열기 시 발송 이력으로 기록
  async function logSend(to, how) {
    await db.from("message_logs").insert({
      artist_id: artistId, channel: "sms", body: currentBody(), recipients: to, status: "sent", result: { how } });
    loadLogs();
  }
  $("copyNumbers").addEventListener("click", async () => {
    const to = selected();
    if (!to.length) return alert("받는 사람을 선택해 주세요.");
    try {
      await navigator.clipboard.writeText(`${to.map((r) => r.phone).join(",")}\n\n${currentBody()}`);
      $("sendMsg").textContent = `번호 ${to.length}개와 내용을 복사했습니다. 카카오톡·문자앱에 붙여넣으세요.`;
      logSend(to, "copy");
    } catch { $("sendMsg").textContent = "복사에 실패했습니다. 브라우저 권한을 확인하세요."; }
  });
  $("openSms").addEventListener("click", () => {
    const to = selected();
    if (!to.length) return alert("받는 사람을 선택해 주세요.");
    logSend(to, "sms-app");
    location.href = `sms:${to.map((r) => r.phone).join(",")}?body=${encodeURIComponent(currentBody())}`;
  });

  async function loadLogs() {
    const { data } = await db.from("message_logs").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(20);
    const ST = { sent: "발송", partial: "일부 실패", failed: "실패" };
    $("logBody").replaceChildren(...(data || []).map((l) => el("tr", {},
      el("td", { textContent: fmt(l.created_at) }), el("td", { textContent: ST[l.status] || l.status }),
      el("td", { textContent: `${l.recipients.length}명` }), el("td", { textContent: l.body.slice(0, 60) }))));
  }

  // 수강생 목록이 로드된 뒤 수신자 갱신
  const tabBtn = document.querySelector('[data-tab="send"]');
  tabBtn.addEventListener("click", () => { buildRecipients(); loadLogs(); });

  // ---------- 사이트 정보 (홈페이지 내용) ----------
  const LESSON_FIELDS = [["subject", "과목"], ["target", "대상"], ["format", "방식"], ["time", "시간"], ["place", "장소"], ["price", "수강료"]];
  function addLessonRow(v = {}) {
    const row = el("div", { className: "card", style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px" },
      ...LESSON_FIELDS.map(([k, label]) => el("input", { name: k, placeholder: label, value: v[k] || "", maxlength: 100, "aria-label": label })));
    row.append(btn("삭제", () => row.remove()));
    $("lessonRows").append(row);
  }
  $("addLessonRow").addEventListener("click", () => addLessonRow());

  // 사이트 사진: 히어로 사진 2장 (공개 버킷 site-images)
  const SITE_IMAGES = [
    ["hero1", "히어로 사진 ①", "홈페이지 첫 화면에 먼저 보이는 사진입니다.", 2200],
    ["hero2", "히어로 사진 ②", "①이 서서히 사라지며 나타나는 사진입니다. 하나만 올리면 움직임 없이 고정됩니다.", 2200]
  ];
  let siteImages = {};
  const siteImgUrl = (path) => db.storage.from("site-images").getPublicUrl(path).data.publicUrl;
  function renderSiteImages() {
    $("siteImages").replaceChildren(...SITE_IMAGES.map(([key, label, hint]) => {
      const preview = el("div", {}, ...(siteImages[key] ? [el("img", { src: siteImgUrl(siteImages[key]), alt: label, style: "max-width:200px;max-height:120px;object-fit:cover;display:block;margin-bottom:6px" })] : []));
      const input = el("input", { type: "file", accept: "image/*", name: "img_" + key });
      const rm = el("label", { className: "check", style: "font-weight:400" }, el("input", { type: "checkbox", name: "rm_" + key }), " 이 사진 삭제");
      rm.hidden = !siteImages[key];
      return el("div", { className: "card", style: "margin-bottom:10px" }, el("strong", { textContent: label }),
        el("div", { className: "muted", textContent: hint }), preview, input, rm);
    }));
  }

  async function loadSite() {
    const { data, error } = await db.from("artists").select("slug,name,profile").eq("id", artistId).single();
    if (fail(error)) return;
    const p = window.mergeProfile(data.profile), f = $("siteForm").elements;
    siteImages = { ...p.images }; renderSiteImages();
    f.englishName.value = p.englishName; f.nickname.value = p.nickname; f.nameDisplay.value = p.nameDisplay;
    f.name.value = data.name; f.tagline.value = p.tagline; f.field.value = p.field; f.intro.value = p.intro;
    f.philosophy.value = p.philosophy; f.career.value = p.career.join(String.fromCharCode(10));
    f.subjects.value = p.subjects.join(", "); f.kakao.value = p.contact.kakao; f.email.value = p.contact.email; f.phone.value = p.contact.phone;
    $("lessonRows").replaceChildren();
    (p.lessons.length ? p.lessons : [{}]).forEach(addLessonRow);
    const url = `${siteBase()}index.html?a=${encodeURIComponent(data.slug)}`;
    $("myUrl").href = url; $("myUrl").textContent = url;
    $("copyUrl").onclick = () => navigator.clipboard.writeText(url).then(() => ($("siteMsg").textContent = "주소를 복사했습니다."));
  }
  $("siteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements, lines = (t) => t.split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean);
    const lessons = [...$("lessonRows").children].map((r) => Object.fromEntries(LESSON_FIELDS.map(([k]) => [k, r.querySelector(`[name=${k}]`).value.trim()])))
      .filter((l) => l.subject);
    // 사진 업로드/삭제 (바뀐 항목만)
    const form = e.target, bucket = db.storage.from("site-images");
    for (const [key, , , max] of SITE_IMAGES) {
      const file = form.elements["img_" + key].files[0], remove = form.elements["rm_" + key]?.checked;
      if (!file && !remove) continue;
      let path = siteImages[key];
      if (file) {
        let blob;
        try { blob = await shrink(file, max); } catch { return alert("이미지를 처리하지 못했습니다. 다른 파일을 선택해 주세요."); }
        const next = `${artistId}/${key}-${crypto.randomUUID().slice(0, 8)}.jpg`;
        const up = await bucket.upload(next, blob, { contentType: "image/jpeg" });
        if (fail(up.error)) return;
        if (path) await bucket.remove([path]);
        siteImages[key] = next;
      } else {
        await bucket.remove([path]); delete siteImages[key];
      }
    }
    const profile = {
      englishName: f.englishName.value.trim(), nameDisplay: f.nameDisplay.value, nickname: f.nickname.value.trim(), images: siteImages,
      tagline: f.tagline.value.trim(), field: f.field.value.trim(), intro: f.intro.value.trim(), philosophy: f.philosophy.value.trim(),
      career: lines(f.career.value), subjects: f.subjects.value.split(",").map((x) => x.trim()).filter(Boolean), lessons,
      contact: { kakao: f.kakao.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim() }
    };
    const { error } = await db.from("artists").update({ name: f.name.value.trim(), profile }).eq("id", artistId);
    if (fail(error)) return;
    $("brand").textContent = f.name.value.trim() + " · 레슨 관리";
    renderSiteImages();
    $("siteMsg").textContent = "저장했습니다. 홈페이지에 바로 반영됩니다.";
  });

  loadSite(); loadEvents(); loadVideos(); loadSettings(); loadContacts();
};
