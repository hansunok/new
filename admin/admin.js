(function () {
  const S = window.SITE;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  };
  if (!S.supabaseUrl || !S.supabaseAnonKey) {
    $("err").textContent = "js/config.js에 Supabase URL과 anon key를 설정해 주세요.";
    return;
  }
  const db = supabase.createClient(S.supabaseUrl, S.supabaseAnonKey);
  let artistId = null, currentArtist = null;
  const KIND = { inquiry: "문의", consult: "상담", trial: "체험" };
  const INQ_STATUS = { new: "신규", contacted: "연락함", enrolled: "등록", closed: "종료" };
  const STU_STATUS = { active: "수강", paused: "휴강", left: "퇴원" };

  async function boot() {
    const { data: { session } } = await db.auth.getSession();
    $("login").hidden = !!session;
    $("app").hidden = !session;
    $("logout").hidden = !session;
    $("who").textContent = session ? session.user.email : "";
    if (!session) return;
    const { data: artist, error } = await db.from("artists").select("id,slug,name,status").eq("owner_id", session.user.id).maybeSingle();
    if (error) { $("err").textContent = error.message; $("app").hidden = true; return; }
    loadPlatform();
    $("pendingBox").hidden = true;
    if (artist && artist.status !== "approved") {      // 승인 대기 / 정지
      $("app").hidden = true; $("onboard").hidden = true; $("pendingBox").hidden = false;
      const pending = artist.status === "pending";
      $("pendingTitle").textContent = pending ? "승인 대기 중입니다" : "사용이 중지된 계정입니다";
      $("pendingText").textContent = pending
        ? `'${artist.name}' 사이트는 관리자의 승인 후 공개되고 모든 기능을 사용할 수 있습니다. 승인되면 이 페이지를 새로고침해 주세요.`
        : "자세한 내용은 플랫폼 운영자에게 문의해 주세요.";
      return;
    }
    if (!artist) {                       // 첫 로그인: 홈페이지 만들기
      $("app").hidden = true; $("onboard").hidden = false;
      return;
    }
    $("onboard").hidden = true;
    $("brand").textContent = artist.name + " · 레슨 관리";
    artistId = artist.id; currentArtist = artist;
    loadInquiries(); loadStudents(); setView(view);
    window.initContent({ db, artistId, artist: currentArtist, $, el, getStudents: () => students });
  }

  // ---- 플랫폼 관리자: 아티스트 승인 ----
  async function loadPlatform() {
    const { data: me } = await db.from("platform_admins").select("user_id").maybeSingle();
    $("platformBox").hidden = !me;
    if (!me) return;
    const { data, error } = await db.rpc("platform_artists");
    if (error) return ($("err").textContent = error.message);
    const ST = { pending: "승인 대기", approved: "승인", suspended: "정지" };
    $("pendingCount").textContent = data.filter((a) => a.status === "pending").length || "";
    $("platformBody").replaceChildren(...data.map((a) => {
      const act = (label, status, danger) => {
        const b = el("button", { className: "btn small" + (danger ? " ghost" : ""), textContent: label, type: "button" });
        b.addEventListener("click", async () => {
          if (status === "suspended" && !confirm(`'${a.name}' 사이트를 정지할까요? 홈페이지가 즉시 비공개됩니다.`)) return;
          const { error } = await db.from("artists").update({ status }).eq("id", a.id);
          if (error) return alert(error.message);
          loadPlatform();
        });
        return b;
      };
      const buttons = a.status === "pending" ? [act("승인", "approved")]
        : a.status === "approved" ? [act("정지", "suspended", true)] : [act("다시 승인", "approved")];
      return el("tr", {},
        el("td", { textContent: new Date(a.created_at).toLocaleDateString("ko-KR") }),
        el("td", { textContent: a.name }), el("td", { textContent: a.slug }), el("td", { textContent: a.email }),
        el("td", {}, el("span", { className: "badge", textContent: ST[a.status] })), el("td", {}, ...buttons));
    }));
  }

  $("signup").addEventListener("click", async () => {
    const f = $("login");
    if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f));
    const { data, error } = await db.auth.signUp(d);
    if (error) return ($("loginMsg").textContent = "가입 실패: " + error.message);
    if (data.session) { $("loginMsg").textContent = ""; boot(); }
    else $("loginMsg").textContent = "확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.";
  });

  $("onboard").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), msg = $("onboardMsg");
    const slug = d.slug.trim().toLowerCase();
    if (!window.SLUG_RE.test(slug) || window.RESERVED_SLUGS.includes(slug)) return (msg.textContent = "주소는 영문 소문자·숫자·하이픈 3~30자로, 예약어(admin 등)는 쓸 수 없습니다.");
    const { data: { session } } = await db.auth.getSession();
    const { error } = await db.from("artists").insert({ owner_id: session.user.id, slug, name: d.name.trim() });
    if (error) return (msg.textContent = error.code === "23505" ? "이미 사용 중인 주소입니다. 다른 주소를 입력하세요." : "생성 실패: " + error.message);
    msg.textContent = "";
    boot();
  });

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const { error } = await db.auth.signInWithPassword(d);
    $("loginMsg").textContent = error ? "로그인 실패: " + error.message : "";
    if (!error) boot();
  });
  $("logout").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });

  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tabs button").forEach((x) => ($("tab-" + x.dataset.tab).hidden = x !== b));
  }));

  // ---- 신청·상담 ----
  async function loadInquiries() {
    const { data, error } = await db.from("inquiries").select("*").eq("artist_id", artistId).order("created_at", { ascending: false });
    if (error) return ($("err").textContent = error.message);
    $("newCount").textContent = data.filter((x) => x.status === "new").length || "";
    $("inqBody").replaceChildren(...data.map((q) => {
      const sel = el("select");
      Object.entries(INQ_STATUS).forEach(([v, t]) => sel.append(el("option", { value: v, textContent: t, selected: q.status === v })));
      sel.addEventListener("change", async () => {
        await db.from("inquiries").update({ status: sel.value }).eq("id", q.id); loadInquiries();
      });
      const conv = el("button", { className: "btn small ghost", textContent: q.student_id ? "등록됨" : "수강생 등록", disabled: !!q.student_id });
      conv.addEventListener("click", async () => {
        const { data: s, error } = await db.from("students").insert({
          artist_id: artistId, name: q.name, phone: q.contact, subject: q.subject, level: q.level, source: "홈페이지 신청", notes: q.message
        }).select("id").single();
        if (error) return alert(error.message);
        await db.from("inquiries").update({ student_id: s.id, status: "enrolled" }).eq("id", q.id);
        loadInquiries(); loadStudents();
      });
      return el("tr", {},
        el("td", { textContent: new Date(q.created_at).toLocaleDateString("ko-KR") }),
        el("td", { textContent: KIND[q.kind] || q.kind }),
        el("td", { textContent: q.name }), el("td", { textContent: q.contact }),
        el("td", { textContent: [q.subject, q.level].filter(Boolean).join(" / ") }),
        el("td", { textContent: q.available_time || "" }), el("td", { textContent: q.message || "" }),
        el("td", {}, sel), el("td", {}, conv));
    }));
  }

  // ---- 수강생 ----
  let students = [];
  let currentSchool = {};
  let schoolStudent = null;
  async function loadStudents() {
    const { data, error } = await db.from("students").select("*").eq("artist_id", artistId).order("created_at", { ascending: false });
    if (error) return ($("err").textContent = error.message);
    students = data;
    const { data: cur } = await db.from("student_schools").select("student_id,school_name,grade").is("ended_on", null);
    currentSchool = Object.fromEntries((cur || []).map((r) => [r.student_id, `${r.school_name} ${r.grade}`]));
    renderStudents();
    $("lessonStudent").replaceChildren(...students.filter((s) => s.status === "active")
      .map((s) => el("option", { value: s.id, textContent: s.name })));
  }
  function renderStudents() {
    const rows = students.filter((s) => $("showLeft").checked || s.status !== "left");
    $("stuBody").replaceChildren(...rows.map((s) => {
      const edit = el("button", { className: "btn small ghost", textContent: "수정" });
      edit.addEventListener("click", () => {
        const f = $("studentForm");
        Object.keys(s).forEach((k) => { if (f.elements[k]) f.elements[k].value = s[k] ?? ""; });
        f.scrollIntoView({ behavior: "smooth" });
      });
      const school = el("button", { className: "btn small ghost", textContent: "학교 이력" });
      school.addEventListener("click", () => openSchool(s));
      return el("tr", {},
        el("td", { textContent: s.name }),
        el("td", { textContent: currentSchool[s.id] || "" }),
        el("td", { textContent: s.phone || "" }),
        el("td", { textContent: [s.guardian_name, s.guardian_phone].filter(Boolean).join(" ") }),
        el("td", { textContent: [s.subject, s.level].filter(Boolean).join(" / ") }),
        el("td", { textContent: s.goal || "" }),
        el("td", {}, el("span", { className: "badge", textContent: STU_STATUS[s.status] })),
        el("td", {}, edit, " ", school));
    }));
  }
  $("showLeft").addEventListener("change", renderStudents);
  $("studentReset").addEventListener("click", () => $("studentForm").reset());
  $("studentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const id = d.id; delete d.id;
    Object.keys(d).forEach((k) => { if (d[k] === "") d[k] = null; });
    const { error } = id
      ? await db.from("students").update(d).eq("id", id)
      : await db.from("students").insert({ ...d, artist_id: artistId });
    if (error) return alert(error.message);
    e.target.reset(); loadStudents();
  });

  // ---- 학교·학년 이력 ----
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  async function openSchool(s) {
    schoolStudent = s;
    $("schoolTitle").textContent = `${s.name} — 학교·학년 이력`;
    $("schoolForm").elements.started_on.value = today();
    $("schoolPanel").hidden = false;
    $("schoolPanel").scrollIntoView({ behavior: "smooth" });
    await loadSchoolHistory();
  }
  async function loadSchoolHistory() {
    const { data, error } = await db.from("student_schools").select("*")
      .eq("student_id", schoolStudent.id).order("started_on", { ascending: false });
    if (error) return alert(error.message);
    $("schoolHistory").replaceChildren(...(data.length ? data.map((r) => el("tr", {},
      el("td", { textContent: r.school_name }), el("td", { textContent: r.grade }),
      el("td", { textContent: `${r.started_on} ~ ${r.ended_on || "현재"}` })))
      : [el("tr", {}, el("td", { colSpan: 3, className: "muted", textContent: "등록된 이력이 없습니다." }))]));
  }
  $("schoolClose").addEventListener("click", () => ($("schoolPanel").hidden = true));
  $("schoolForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const start = d.started_on || today();
    const { data: prev } = await db.from("student_schools").select("*").eq("student_id", schoolStudent.id).is("ended_on", null).maybeSingle();
    if (prev) {
      const end = addDays(start, -1);
      const { error } = await db.from("student_schools").update({ ended_on: end < prev.started_on ? prev.started_on : end }).eq("id", prev.id);
      if (error) return alert(error.message);
    }
    const { error } = await db.from("student_schools").insert({
      student_id: schoolStudent.id, school_name: d.school_name, grade: d.grade, started_on: start });
    if (error) {
      if (prev) await db.from("student_schools").update({ ended_on: null }).eq("id", prev.id);
      return alert(error.message);
    }
    e.target.reset(); e.target.elements.started_on.value = today();
    await loadSchoolHistory(); loadStudents();
  });

  // ---- 일정·출결 ----
  const LESSON_STATUS = { scheduled: "예정", attended: "출석", late: "지각", absent: "결석", cancelled: "휴강", rescheduled: "변경(보강예정)" };
  const LESSON_KIND = { regular: "정기", once: "일회성", makeup: "보강", trial: "체험" };
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  let weekStart = mondayOf(new Date());

  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
  const fmtTime = (d) => d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

  async function loadLessons() {
    const end = new Date(weekStart); end.setDate(end.getDate() + 7);
    const last = new Date(end); last.setDate(last.getDate() - 1);
    $("weekLabel").textContent = ` ${fmtDate(weekStart)} ~ ${fmtDate(last)} `;
    const { data, error } = await db.from("lessons").select("*, students(name)").eq("artist_id", artistId)
      .gte("starts_at", weekStart.toISOString()).lt("starts_at", end.toISOString()).order("starts_at");
    if (error) return ($("err").textContent = error.message);
    $("lessonBody").replaceChildren(...(data.length ? data : []).map((l) => {
      const s = new Date(l.starts_at), e = new Date(l.ends_at);
      const sel = el("select");
      Object.entries(LESSON_STATUS).forEach(([v, t]) => sel.append(el("option", { value: v, textContent: t, selected: l.status === v })));
      sel.addEventListener("change", async () => {
        const { error } = await db.from("lessons").update({ status: sel.value }).eq("id", l.id);
        if (error) alert(error.message);
        loadLessons();
      });
      const makeup = el("button", { className: "btn small ghost", textContent: "보강 등록" });
      makeup.hidden = !["cancelled", "absent", "rescheduled"].includes(l.status) || l.kind === "makeup";
      makeup.addEventListener("click", async () => {
        const v = prompt("보강 일시 (예: 2026-10-20 19:00)");
        if (!v) return;
        const start = new Date(v.replace(" ", "T"));
        if (isNaN(start)) return alert("형식이 올바르지 않습니다.");
        const mins = (e - s) / 60000;
        const { error } = await db.from("lessons").insert({
          artist_id: artistId, student_id: l.student_id, pass_id: l.pass_id, kind: "makeup", makeup_of: l.id,
          location: l.location, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + mins * 60000).toISOString()
        });
        if (error) return alert(error.message);
        if (l.status !== "rescheduled") await db.from("lessons").update({ status: "rescheduled" }).eq("id", l.id);
        loadLessons();
      });
      const del = el("button", { className: "btn small ghost", textContent: "삭제" });
      del.addEventListener("click", async () => {
        if (!confirm("이 일정을 삭제할까요? 휴강 처리는 상태에서 '휴강'을 선택하세요.")) return;
        await db.from("lessons").delete().eq("id", l.id); loadLessons();
      });
      return el("tr", {},
        el("td", { textContent: `${fmtDate(s)} ${fmtTime(s)}–${fmtTime(e)}` }),
        el("td", { textContent: l.students?.name || "" }),
        el("td", { textContent: LESSON_KIND[l.kind] }),
        el("td", { textContent: l.location || "" }),
        el("td", {}, sel), el("td", {}, makeup, " ", del));
    }));
    if (!data.length) $("lessonBody").append(el("tr", {}, el("td", { colSpan: 6, className: "muted", textContent: "이 주에는 등록된 일정이 없습니다." })));
  }
  const shiftWeek = (n) => { weekStart.setDate(weekStart.getDate() + n); loadLessons(); };
  $("weekPrev").addEventListener("click", () => shiftWeek(-7));
  $("weekNext").addEventListener("click", () => shiftWeek(7));
  $("weekToday").addEventListener("click", () => { weekStart = mondayOf(new Date()); loadLessons(); });

  // ---- 월간 캘린더 ----
  let view = "month";
  let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const refresh = () => (view === "month" ? loadMonth() : loadLessons());

  function setView(v) {
    view = v;
    $("listView").hidden = v !== "list";
    $("calView").hidden = v !== "month";
    document.querySelectorAll("#viewSwitch button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    refresh();
  }
  document.querySelectorAll("#viewSwitch button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  async function loadMonth() {
    const gridStart = mondayOf(monthStart);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);
    $("monthLabel").textContent = ` ${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월 `;
    const { data, error } = await db.from("lessons").select("*, students(name)").eq("artist_id", artistId)
      .gte("starts_at", gridStart.toISOString()).lt("starts_at", gridEnd.toISOString()).order("starts_at");
    if (error) return ($("err").textContent = error.message);
    const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const byDay = {};
    data.forEach((l) => { (byDay[key(new Date(l.starts_at))] ||= []).push(l); });
    const cells = ["월", "화", "수", "목", "금", "토", "일"].map((t) => el("div", { className: "dow", textContent: t }));
    const todayKey = key(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      if (i >= 35 && d.getMonth() !== monthStart.getMonth()) break;   // 마지막 줄이 전부 다음 달이면 생략
      const cell = el("div", { className: "day" + (d.getMonth() !== monthStart.getMonth() ? " other" : "") + (key(d) === todayKey ? " today" : "") },
        el("span", { className: "num", textContent: d.getDate() }));
      (byDay[key(d)] || []).forEach((l) => {
        const chip = el("span", { className: `chip ${l.status} ${l.kind}`, textContent: `${fmtTime(new Date(l.starts_at))} ${l.students?.name || ""}`,
          title: `${LESSON_KIND[l.kind]} · ${LESSON_STATUS[l.status]}${l.location ? " · " + l.location : ""}` });
        cell.append(chip);
      });
      cell.addEventListener("click", () => showDay(d));
      if (selectedDay && key(d) === key(selectedDay)) cell.style.outline = "2px solid var(--accent)";
      cells.push(cell);
    }
    $("monthGrid").replaceChildren(...cells);
    monthData = byDay; dayKey = key;
    if (selectedDay) renderDay();
  }

  // 선택한 날짜의 수강 내역
  let selectedDay = null, monthData = {}, dayKey = null;
  function showDay(d) { selectedDay = d; loadMonth(); $("dayPanel").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  function renderDay() {
    const d = selectedDay, list = monthData[dayKey(d)] || [];
    $("dayPanel").hidden = false;
    $("dayTitle").textContent = `${d.getFullYear()}년 ${fmtDate(d)} 수강 내역 (${list.length}건)`;
    $("dayBody").replaceChildren(...(list.length ? list.map((l) => {
      const sel = el("select");
      Object.entries(LESSON_STATUS).forEach(([v, t]) => sel.append(el("option", { value: v, textContent: t, selected: l.status === v })));
      sel.addEventListener("change", async () => {
        const { error } = await db.from("lessons").update({ status: sel.value }).eq("id", l.id);
        if (error) alert(error.message);
        loadMonth();
      });
      return el("tr", {},
        el("td", { textContent: `${fmtTime(new Date(l.starts_at))}–${fmtTime(new Date(l.ends_at))}` }),
        el("td", { textContent: l.students?.name || "" }), el("td", { textContent: LESSON_KIND[l.kind] }),
        el("td", { textContent: l.location || "" }), el("td", {}, sel));
    }) : [el("tr", {}, el("td", { colSpan: 5, className: "muted", textContent: "이 날짜에 예약된 수업이 없습니다." }))]));
  }
  $("dayAdd").addEventListener("click", () => {
    const d = selectedDay;
    $("lessonForm").elements.date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    $("lessonForm").scrollIntoView({ behavior: "smooth" });
  });
  $("dayWeek").addEventListener("click", () => { weekStart = mondayOf(selectedDay); setView("list"); });
  const shiftMonth = (n) => { monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + n, 1); loadMonth(); };
  $("monthPrev").addEventListener("click", () => shiftMonth(-1));
  $("monthNext").addEventListener("click", () => shiftMonth(1));
  $("monthToday").addEventListener("click", () => { monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1); loadMonth(); });

  $("lessonForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const first = new Date(`${d.date}T${d.time}`);
    const rows = [];
    for (let i = 0; i < (d.kind === "regular" ? +d.weeks || 1 : 1); i++) {
      const st = new Date(first); st.setDate(st.getDate() + 7 * i);
      rows.push({
        artist_id: artistId, student_id: d.student_id, kind: d.kind, location: d.location || null,
        starts_at: st.toISOString(), ends_at: new Date(st.getTime() + d.minutes * 60000).toISOString()
      });
    }
    const { error } = await db.from("lessons").insert(rows);
    if (error) return alert(error.message);
    weekStart = mondayOf(first); monthStart = new Date(first.getFullYear(), first.getMonth(), 1); refresh();
  });

  boot();
})();
