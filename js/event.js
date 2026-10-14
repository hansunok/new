(async function () {
  const S = window.SITE, $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !S.supabaseUrl) return ($("msg").textContent = "공연 정보를 찾을 수 없습니다.");
  const db = supabase.createClient(S.supabaseUrl, S.supabaseAnonKey);
  const { data: x } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!x) return ($("msg").textContent = "공연 정보를 찾을 수 없습니다.");
  const { data: a } = await db.from("artist_sites").select("slug,name").eq("id", x.artist_id).maybeSingle();
  if (a) { $("logo").textContent = a.name; $("logo").href = "index.html?a=" + encodeURIComponent(a.slug); }
  document.title = x.title;
  $("title").textContent = x.title;
  $("when").textContent = new Date(x.starts_at).toLocaleString("ko-KR", { dateStyle: "full", timeStyle: "short" });
  $("venue").textContent = x.venue ? "장소: " + x.venue : "";
  $("desc").textContent = x.description || "";
  if (x.image_path) { $("poster").src = db.storage.from("event-images").getPublicUrl(x.image_path).data.publicUrl; $("poster").alt = x.title; $("poster").hidden = false; }
  if (x.link_url && /^https?:\/\//i.test(x.link_url)) { $("link").href = x.link_url; $("link").hidden = false; }
})();
