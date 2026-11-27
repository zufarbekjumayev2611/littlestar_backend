// Little Star — "Olimpiadaga tayyorlov": onlayn kurslar (Al-Xorazmiy olimpiadasi va boshqalar)
// Darslar jadvali, jonli dars (video konferensiya havolasi), video yechimlar, materiallar,
// uyga vazifa topshirish va tekshirish, savol-javob, davomat, jurnal, to‘lov (Payme, Click).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

module.exports = function academy({ db, route, HttpError, bad, str, now, UPLOAD_DIR, PUBLIC_URL }) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Birinchi ishga tushishda: Al-Xorazmiy olimpiadasi va uning 7–8-sinflar uchun kursi
  async function init() {
    if ((await db.get("SELECT COUNT(*) n FROM olympiads")).n === 0) {
      const r = await db.run("INSERT INTO olympiads(name,description,icon,sort,created_at) VALUES(?,?,?,?,?)",
        "Al-Xorazmiy olimpiadasi", "Al-Xorazmiy nomidagi matematika olimpiadasiga tayyorlov: 7- va 8-sinflar uchun jonli onlayn darslar, video yechimlar, uyga vazifalar.", "🧮", 1, now());
      if ((await db.get("SELECT COUNT(*) n FROM courses")).n === 0)
        await db.run("INSERT INTO courses(olympiad_id,title,grade,grade_to,description,sort,created_at) VALUES(?,?,?,?,?,?,?)", r.lastInsertRowid,
          "Al-Xorazmiy olimpiadasi (7–8-sinflar)", 7, 8, "Al-Xorazmiy nomidagi matematika olimpiadasiga tayyorlov kursi (7–8-sinflar). Jonli onlayn darslar, video yechimlar va uyga vazifalar.", 1, now());
    }
  }

  /* ---------------- yordamchilar ---------------- */
  const isTeacher = (a) => !!a && (a.role === "admin" || a.role === "teacher");
  const KINDS = ["material", "video", "homework", "solution"];
  const SOL_MODES = ["after_due", "now", "hidden"];
  const cleanUrl = (u) => { u = str(u, 500); if (!u) return ""; if (!/^https?:\/\//i.test(u)) bad("Havola http:// yoki https:// bilan boshlanishi kerak"); return u; };
  const fileUrl = (f) => `${PUBLIC_URL}/files/${f.id}/${f.key}/${encodeURIComponent(f.name)}`;
  const pubFile = (f) => f && { id: f.id, name: f.name, mime: f.mime, size: f.size, url: fileUrl(f) };
  const ids = (json) => { try { return JSON.parse(json || "[]").map(Number).filter(Number.isFinite); } catch { return []; } };
  async function filesByIds(list) {
    const u = [...new Set(list)]; if (!u.length) return new Map();
    const rows = await db.all(`SELECT * FROM files WHERE id IN (${u.map(() => "?").join(",")})`, ...u);
    return new Map(rows.map((f) => [f.id, f]));
  }
  async function filesFromIds(json) { const l = ids(json); const m = await filesByIds(l); return l.map((i) => pubFile(m.get(i))).filter(Boolean); }
  // Foydalanuvchi biriktirayotgan fayllar o‘ziga tegishli ekanini tekshirish (o‘qituvchi istalganini biriktira oladi)
  async function ownFiles(account, list, max = 15) {
    if (!Array.isArray(list)) return [];
    const want = list.slice(0, max).map(Number);
    const m = await filesByIds(want.filter(Number.isFinite));
    for (const i of want) { const f = m.get(i); if (!f || (f.account_id !== account.id && !isTeacher(account))) bad("Fayl topilmadi, qayta yuklang"); }
    return want;
  }
  async function ownChild(account, id) {
    const c = await db.get("SELECT * FROM children WHERE id=? AND account_id=?", +id, account.id);
    if (!c) bad("O‘quvchi profilini tanlang"); return c;
  }
  const enrollment = (courseId, childId, q = db) => q.get("SELECT status, paid_until FROM enrollments WHERE course_id=? AND child_id=?", courseId, childId);
  // O‘quvchining kursdagi holati: active | pending | removed | unpaid | expired | null
  function accessState(c, e) {
    if (!e) return null;
    if (e.status === "removed") return "removed";
    if (c.price > 0) {
      if (e.status === "active" && (e.paid_until === -1 || e.paid_until > now())) return "active";
      return e.paid_until > 0 ? "expired" : "unpaid";
    }
    return e.status;
  }
  const gradeLabel = (c) => (c.grade_to && c.grade_to !== c.grade ? `${c.grade}–${c.grade_to}` : `${c.grade}`) + "-sinf";
  async function lessonFor(account, lessonId, childId) {
    const l = await db.get("SELECT l.*, c.live_url course_live, c.title course_title, c.price course_price FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?", +lessonId);
    if (!l) throw new HttpError(404, "Dars topilmadi");
    if (isTeacher(account) && !childId) return { l, child: null };
    const child = await ownChild(account, childId);
    if (!isTeacher(account)) {
      const st = accessState({ price: l.course_price }, await enrollment(l.course_id, child.id));
      if (st !== "active") throw new HttpError(403, st === "expired" ? "Kurs uchun to‘lov muddati tugagan. Uzaytirish uchun to‘lov qiling." : st === "unpaid" ? "Bu kurs pullik. Avval to‘lov qiling." : "Bu kursga hali qabul qilinmagansiz");
      if (!l.published) throw new HttpError(404, "Dars topilmadi");
    }
    return { l, child };
  }
  const solutionsOpen = (l) => l.solutions_mode === "now" || (l.solutions_mode === "after_due" && (!l.hw_due || now() >= l.hw_due));
  async function items(lessonId, { hideSolutions = false } = {}) {
    const rows = (await db.all("SELECT * FROM lesson_items WHERE lesson_id=? ORDER BY ord,id", lessonId)).filter((i) => !(hideSolutions && i.kind === "solution"));
    const m = await filesByIds(rows.map((i) => i.file_id).filter(Boolean));
    return rows.map((i) => ({ id: i.id, kind: i.kind, title: i.title, url: i.url, file: i.file_id ? pubFile(m.get(i.file_id)) || null : null }));
  }
  async function comments(lessonId) {
    return (await db.all(`SELECT m.id, m.text, m.created_at, m.account_id, a.role, a.parent_name, c.name child_name
      FROM lesson_comments m LEFT JOIN accounts a ON a.id=m.account_id LEFT JOIN children c ON c.id=m.child_id
      WHERE m.lesson_id=? ORDER BY m.id`, lessonId))
      .map((m) => { const t = m.role === "admin" || m.role === "teacher"; return { id: m.id, text: m.text, created_at: m.created_at, teacher: t, author: t ? "O‘qituvchi" : (m.child_name || m.parent_name || "O‘quvchi") }; });
  }
  async function pubSub(s) {
    if (!s) return null;
    const [files, feedback_files] = await Promise.all([filesFromIds(s.files), filesFromIds(s.feedback_files)]);
    return { id: s.id, text: s.text, files, status: s.status, score: s.score, feedback: s.feedback, feedback_files, submitted_at: s.submitted_at, checked_at: s.checked_at };
  }
  // Darsni bog‘liq yozuvlari bilan o‘chirish uchun so‘rovlar ro‘yxati
  const lessonDeletes = (where, ...a) => [
    [`DELETE FROM lesson_items WHERE lesson_id IN (SELECT id FROM lessons WHERE ${where})`, ...a],
    [`DELETE FROM submissions WHERE lesson_id IN (SELECT id FROM lessons WHERE ${where})`, ...a],
    [`DELETE FROM lesson_comments WHERE lesson_id IN (SELECT id FROM lessons WHERE ${where})`, ...a],
    [`DELETE FROM attendance WHERE lesson_id IN (SELECT id FROM lessons WHERE ${where})`, ...a],
    [`DELETE FROM lessons WHERE ${where}`, ...a],
  ];

  /* ---------------- fayl yuklash (oqim bilan, JSON emas) ---------------- */
  // Fayllar serverning diskida (UPLOAD_DIR) saqlanadi, bazada faqat ularning ma’lumoti turadi.
  const MEDIA_INLINE = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm)|application\/pdf)$/;
  route("POST", "/api/upload", ({ req, account, query }) => new Promise((resolve, reject) => {
    const teacher = isTeacher(account);
    const max = teacher ? 2 * 1024 ** 3 : 25 * 1024 ** 2;
    const name = str(query.name || "fayl", 150).replace(/[\\/\0]/g, "_") || "fayl";
    let mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase();
    if (!teacher && !/^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/.test(mime))
      return reject(new HttpError(400, "Faqat rasm (JPG, PNG) yoki PDF yuklash mumkin"));
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) mime = "application/octet-stream";
    const len = +req.headers["content-length"] || 0;
    if (len > max) return reject(new HttpError(413, `Fayl juda katta (ko‘pi bilan ${Math.round(max / 1024 ** 2)} MB)`));
    const key = crypto.randomBytes(18).toString("hex");
    const tmp = path.join(UPLOAD_DIR, "tmp-" + key);
    const out = fs.createWriteStream(tmp);
    let size = 0, failed = false;
    const fail = (e) => { if (failed) return; failed = true; out.destroy(); fs.rm(tmp, { force: true }, () => {}); reject(e); };
    req.on("data", (c) => { size += c.length; if (size > max) { fail(new HttpError(413, "Fayl juda katta")); req.destroy(); } });
    req.on("error", fail); out.on("error", fail);
    req.pipe(out);
    out.on("finish", async () => {
      if (failed) return;
      if (!size) { fs.rm(tmp, { force: true }, () => {}); return reject(new HttpError(400, "Fayl bo‘sh")); }
      try {
        const r = await db.run("INSERT INTO files(key,name,mime,size,account_id,created_at) VALUES(?,?,?,?,?,?)", key, name, mime, size, account.id, now());
        fs.renameSync(tmp, path.join(UPLOAD_DIR, `${r.lastInsertRowid}-${key}`));
        resolve(pubFile({ id: r.lastInsertRowid, key, name, mime, size }));
      } catch (e) { fs.rm(tmp, { force: true }, () => {}); reject(e); }
    });
  }), { auth: true, raw: true });

  // /files/:id/:key/:name — kalit tasodifiy va uzun, shuning uchun havolani bilganlargina ochadi.
  // Video ko‘rishda oldinga/orqaga o‘tish uchun Range so‘rovlari qo‘llab-quvvatlanadi.
  async function serveFile(req, res, pathname) {
    try {
      const m = pathname.match(/^\/files\/(\d+)\/([a-f0-9]{36})(?:\/[^/]*)?$/);
      const f = m && await db.get("SELECT * FROM files WHERE id=? AND key=?", +m[1], m[2]);
      const file = f && path.join(UPLOAD_DIR, `${f.id}-${f.key}`);
      if (!f || !fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Fayl topilmadi"); }
      const inline = MEDIA_INLINE.test(f.mime);
      const size = fs.statSync(file).size;
      const headers = {
        "Content-Type": inline ? f.mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        // Havola maxfiy kalitga ega; brauzer keshi to‘g‘ri ishlashi uchun CORS ruxsati har doim beriladi
        // (aks holda o‘qituvchi rasm ustida belgilaganda keshdagi rasm bloklanadi)
        "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      };
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (range && (range[1] || range[2])) {
        let start = range[1] ? +range[1] : size - +range[2];
        const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
        if (start < 0) start = 0;
        if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...headers, "Content-Length": size });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end(); } }
  }

  /* ================= O‘QUVCHI ================= */
  route("GET", "/api/academy/olympiads", async ({ account, query }) => {
    const child = query.child ? await ownChild(account, query.child) : null;
    const [olys, courses, enr] = await Promise.all([
      db.all("SELECT id,name,description,icon FROM olympiads WHERE published=1 ORDER BY sort,id"),
      db.all("SELECT id,olympiad_id,grade,grade_to,price FROM courses WHERE published=1"),
      child ? db.all("SELECT course_id,status,paid_until FROM enrollments WHERE child_id=?", child.id) : [],
    ]);
    return olys.map((o) => {
      const cs = courses.filter((c) => c.olympiad_id === o.id);
      const grades = [...new Set(cs.flatMap((c) => { const a = []; for (let g = c.grade; g <= (c.grade_to || c.grade); g++) a.push(g); return a; }))].sort((x, y) => x - y);
      const mine = cs.filter((c) => accessState(c, enr.find((e) => e.course_id === c.id)) === "active").length;
      return { ...o, courses: cs.length, grades, mine };
    });
  }, { auth: true });

  route("GET", "/api/academy/courses", async ({ account, query }) => {
    const child = query.child ? await ownChild(account, query.child) : null;
    const oid = +query.olympiad || 0;
    const [list, enr] = await Promise.all([
      db.all(`SELECT c.id,c.title,c.grade,c.grade_to,c.description,c.open_join,c.olympiad_id,c.price,c.access_days,
          (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id AND l.published=1) lessons,
          (SELECT l.id FROM lessons l WHERE l.course_id=c.id AND l.published=1 AND l.starts_at>? ORDER BY l.starts_at LIMIT 1) next_id,
          (SELECT l.title FROM lessons l WHERE l.course_id=c.id AND l.published=1 AND l.starts_at>? ORDER BY l.starts_at LIMIT 1) next_title,
          (SELECT l.starts_at FROM lessons l WHERE l.course_id=c.id AND l.published=1 AND l.starts_at>? ORDER BY l.starts_at LIMIT 1) next_at
        FROM courses c WHERE c.published=1 AND (?=0 OR c.olympiad_id=?) ORDER BY c.sort,c.id`, now() - 10800, now() - 10800, now() - 10800, oid, oid),
      child ? db.all("SELECT course_id,status,paid_until FROM enrollments WHERE child_id=?", child.id) : [],
    ]);
    return list.map(({ next_id, next_title, next_at, ...c }) => {
      const e = enr.find((x) => x.course_id === c.id);
      return { ...c, grade_label: gradeLabel(c), next: next_id ? { id: next_id, title: next_title, starts_at: next_at } : null,
        paid_until: e ? e.paid_until : null, status: child ? accessState(c, e) : null };
    });
  }, { auth: true });

  route("POST", "/api/academy/courses/:id/join", async ({ account, params, body }) => {
    const child = await ownChild(account, body.child);
    const c = await db.get("SELECT * FROM courses WHERE id=? AND published=1", +params.id); if (!c) throw new HttpError(404, "Kurs topilmadi");
    if (c.price > 0) bad("Bu kurs pullik. “To‘lash” tugmasi orqali to‘lov qiling.");
    const e = await enrollment(c.id, child.id);
    if (e && e.status === "removed") bad("Kursga qo‘shilish uchun o‘qituvchiga murojaat qiling");
    if (!e) await db.run("INSERT OR IGNORE INTO enrollments(course_id,child_id,status,created_at) VALUES(?,?,?,?)", c.id, child.id, c.open_join ? "active" : "pending", now());
    return { status: accessState(c, await enrollment(c.id, child.id)) };
  }, { auth: true });

  route("GET", "/api/academy/courses/:id", async ({ account, params, query }) => {
    const c = await db.get("SELECT c.*,o.name olympiad FROM courses c LEFT JOIN olympiads o ON o.id=c.olympiad_id WHERE c.id=? AND c.published=1", +params.id); if (!c) throw new HttpError(404, "Kurs topilmadi");
    const child = await ownChild(account, query.child);
    const e = await enrollment(c.id, child.id);
    const st = accessState(c, e);
    if (!isTeacher(account) && st !== "active") return { course: { id: c.id, title: c.title, description: c.description, price: c.price, access_days: c.access_days, olympiad_id: c.olympiad_id }, status: st };
    const [lessons, ann] = await Promise.all([
      db.all(`SELECT l.id,l.title,l.starts_at,l.duration_min,l.hw_due,l.hw_max,
          (l.hw_text<>'' OR EXISTS(SELECT 1 FROM lesson_items i WHERE i.lesson_id=l.id AND i.kind='homework')) has_hw,
          (SELECT COUNT(*) FROM lesson_items i WHERE i.lesson_id=l.id AND i.kind IN ('video','solution')) videos,
          s.status sub_status, s.score sub_score
        FROM lessons l LEFT JOIN submissions s ON s.lesson_id=l.id AND s.child_id=?
        WHERE l.course_id=? AND l.published=1 ORDER BY l.starts_at,l.id`, child.id, c.id),
      db.all("SELECT id,text,created_at FROM announcements WHERE course_id=? ORDER BY id DESC LIMIT 20", c.id),
    ]);
    return {
      course: { id: c.id, title: c.title, description: c.description, grade: c.grade, grade_label: gradeLabel(c), has_live: !!c.live_url, olympiad_id: c.olympiad_id, olympiad: c.olympiad, price: c.price, access_days: c.access_days, paid_until: e ? e.paid_until : -1 },
      status: "active", server_time: now(), announcements: ann,
      lessons: lessons.map(({ sub_status, sub_score, has_hw, ...l }) => ({ ...l, has_hw: !!has_hw, sub: sub_status ? { status: sub_status, score: sub_score } : null })),
    };
  }, { auth: true });

  route("GET", "/api/academy/lessons/:id", async ({ account, params, query }) => {
    const { l, child } = await lessonFor(account, params.id, query.child);
    const open = solutionsOpen(l) || isTeacher(account);
    const [its, sub, cms] = await Promise.all([
      items(l.id, { hideSolutions: !open }),
      child ? db.get("SELECT * FROM submissions WHERE lesson_id=? AND child_id=?", l.id, child.id) : null,
      comments(l.id),
    ]);
    return {
      lesson: { id: l.id, course_id: l.course_id, course_title: l.course_title, title: l.title, starts_at: l.starts_at, duration_min: l.duration_min, body: l.body, live_url: l.live_url || l.course_live || "", hw_text: l.hw_text, hw_due: l.hw_due, hw_max: l.hw_max, solutions_mode: l.solutions_mode },
      items: its, solutions_open: open, submission: await pubSub(sub), comments: cms, server_time: now(),
    };
  }, { auth: true });

  route("POST", "/api/academy/lessons/:id/join", async ({ account, params, body }) => {
    const { l, child } = await lessonFor(account, params.id, body.child);
    if (child) await db.run("INSERT OR IGNORE INTO attendance(lesson_id,child_id,joined_at) VALUES(?,?,?)", l.id, child.id, now());
    return { url: l.live_url || l.course_live || "" };
  }, { auth: true });

  route("POST", "/api/academy/lessons/:id/submit", async ({ account, params, body }) => {
    const { l, child } = await lessonFor(account, params.id, body.child);
    if (!child) bad("O‘quvchi profilini tanlang");
    const text = str(body.text, 20000); const files = await ownFiles(account, body.files, 20);
    if (!text && !files.length) bad("Javob matnini yozing yoki yechim rasmini yuklang");
    const ex = await db.get("SELECT * FROM submissions WHERE lesson_id=? AND child_id=?", l.id, child.id);
    if (ex && ex.status === "checked") bad("Vazifa allaqachon tekshirilgan. O‘zgartirish uchun o‘qituvchiga yozing.");
    if (ex) await db.run("UPDATE submissions SET text=?,files=?,status='submitted',submitted_at=? WHERE id=? AND status<>'checked'", text, JSON.stringify(files), now(), ex.id);
    else await db.run("INSERT INTO submissions(lesson_id,child_id,text,files,submitted_at) VALUES(?,?,?,?,?) ON CONFLICT(lesson_id,child_id) DO UPDATE SET text=excluded.text, files=excluded.files, status='submitted', submitted_at=excluded.submitted_at WHERE submissions.status<>'checked'", l.id, child.id, text, JSON.stringify(files), now());
    return { submission: await pubSub(await db.get("SELECT * FROM submissions WHERE lesson_id=? AND child_id=?", l.id, child.id)) };
  }, { auth: true });

  route("POST", "/api/academy/lessons/:id/comments", async ({ account, params, body }) => {
    const { l, child } = await lessonFor(account, params.id, body.child);
    const text = str(body.text, 3000); if (!text) bad("Xabar bo‘sh");
    await db.run("INSERT INTO lesson_comments(lesson_id,account_id,child_id,text,created_at) VALUES(?,?,?,?,?)", l.id, account.id, child ? child.id : null, text, now());
    return { comments: await comments(l.id) };
  }, { auth: true });

  /* ================= O‘QITUVCHI ================= */
  const TCH = { auth: true, teacher: true };

  route("GET", "/api/teach/olympiads", () => db.all("SELECT o.*, (SELECT COUNT(*) FROM courses c WHERE c.olympiad_id=o.id) courses FROM olympiads o ORDER BY sort,id"), TCH);
  function olympiadInput(b) {
    const name = str(b.name, 150); if (!name) bad("Olimpiada nomini yozing");
    return { name, description: str(b.description, 3000), icon: str(b.icon, 8) || "🏆", published: b.published ? 1 : 0, sort: +b.sort || 0 };
  }
  route("POST", "/api/teach/olympiads", async ({ body }) => {
    const o = olympiadInput(body);
    if (!o.sort) o.sort = ((await db.get("SELECT MAX(sort) m FROM olympiads")).m || 0) + 1; // yangi olimpiada ro‘yxat oxiriga
    const r = await db.run("INSERT INTO olympiads(name,description,icon,published,sort,created_at) VALUES(?,?,?,?,?,?)", o.name, o.description, o.icon, o.published, o.sort, now());
    return { id: r.lastInsertRowid };
  }, TCH);
  route("PUT", "/api/teach/olympiads/:id", async ({ body, params }) => {
    const o = olympiadInput(body);
    await db.run("UPDATE olympiads SET name=?,description=?,icon=?,published=?,sort=? WHERE id=?", o.name, o.description, o.icon, o.published, o.sort, +params.id);
    return { ok: true };
  }, TCH);
  route("DELETE", "/api/teach/olympiads/:id", async ({ params }) => {
    if ((await db.get("SELECT COUNT(*) n FROM courses WHERE olympiad_id=?", +params.id)).n) bad("Avval bu olimpiadadagi kurslarni o‘chiring yoki boshqa olimpiadaga o‘tkazing");
    await db.run("DELETE FROM olympiads WHERE id=?", +params.id); return { ok: true };
  }, { auth: true, admin: true });

  route("GET", "/api/teach/courses", () => db.all(`SELECT c.*,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.status='active') students,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.status='pending') pending,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lessons,
      (SELECT COUNT(*) FROM submissions s JOIN lessons l ON l.id=s.lesson_id WHERE l.course_id=c.id AND s.status='submitted') unchecked
    FROM courses c ORDER BY c.sort,c.id`), TCH);

  async function courseInput(b) {
    const title = str(b.title, 150); if (!title) bad("Kurs nomini yozing");
    const olympiad_id = +b.olympiad_id || null;
    if (olympiad_id && !await db.get("SELECT 1 x FROM olympiads WHERE id=?", olympiad_id)) bad("Olimpiadani tanlang");
    const grade = Math.max(1, Math.min(11, +b.grade || 7));
    const grade_to = Math.max(grade, Math.min(11, +b.grade_to || grade));
    return { title, olympiad_id, grade, grade_to, price: Math.max(0, Math.min(100000000, Math.round(+b.price || 0))), access_days: Math.max(0, Math.min(3650, Math.round(+b.access_days || 0))), description: str(b.description, 3000), live_url: cleanUrl(b.live_url), published: b.published ? 1 : 0, open_join: b.open_join ? 1 : 0, sort: +b.sort || 0 };
  }
  route("POST", "/api/teach/courses", async ({ body }) => {
    const c = await courseInput(body);
    const r = await db.run("INSERT INTO courses(title,grade,grade_to,price,access_days,description,live_url,published,open_join,sort,created_at,olympiad_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", c.title, c.grade, c.grade_to, c.price, c.access_days, c.description, c.live_url, c.published, c.open_join, c.sort, now(), c.olympiad_id);
    return { id: r.lastInsertRowid };
  }, TCH);
  route("PUT", "/api/teach/courses/:id", async ({ body, params }) => {
    const c = await courseInput(body);
    await db.run("UPDATE courses SET title=?,grade=?,grade_to=?,price=?,access_days=?,description=?,live_url=?,published=?,open_join=?,sort=?,olympiad_id=? WHERE id=?", c.title, c.grade, c.grade_to, c.price, c.access_days, c.description, c.live_url, c.published, c.open_join, c.sort, c.olympiad_id, +params.id);
    return { ok: true };
  }, TCH);
  route("DELETE", "/api/teach/courses/:id", async ({ params }) => {
    const id = +params.id; // to‘lov yozuvlari (orders, payments) hisob uchun saqlanadi
    await db.batch([...lessonDeletes("course_id=?", id), ["DELETE FROM enrollments WHERE course_id=?", id], ["DELETE FROM announcements WHERE course_id=?", id], ["DELETE FROM courses WHERE id=?", id]]);
    return { ok: true };
  }, { auth: true, admin: true });

  route("GET", "/api/teach/courses/:id", async ({ params }) => {
    const c = await db.get("SELECT * FROM courses WHERE id=?", +params.id); if (!c) throw new HttpError(404, "Topilmadi");
    const [lessons, students, ann] = await Promise.all([
      db.all(`SELECT l.id,l.title,l.starts_at,l.duration_min,l.hw_due,l.hw_max,l.published,
          (SELECT COUNT(*) FROM submissions s WHERE s.lesson_id=l.id) subs,
          (SELECT COUNT(*) FROM submissions s WHERE s.lesson_id=l.id AND s.status='submitted') unchecked,
          (SELECT COUNT(*) FROM attendance a WHERE a.lesson_id=l.id) attended
        FROM lessons l WHERE l.course_id=? ORDER BY l.starts_at,l.id`, c.id),
      db.all(`SELECT e.status, e.created_at, e.paid_until, ch.id child_id, ch.name, ch.grade, ch.region, ch.district, ch.school, a.phone, a.parent_name
        FROM enrollments e JOIN children ch ON ch.id=e.child_id JOIN accounts a ON a.id=ch.account_id
        WHERE e.course_id=? ORDER BY CASE e.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, ch.name`, c.id),
      db.all("SELECT * FROM announcements WHERE course_id=? ORDER BY id DESC", c.id),
    ]);
    return { course: c, lessons, students, announcements: ann };
  }, TCH);

  route("PUT", "/api/teach/courses/:id/students/:child", async ({ params, body }) => {
    const st = ["active", "pending", "removed"].includes(body.status) ? body.status : bad("Holat noto‘g‘ri");
    const c = await db.get("SELECT * FROM courses WHERE id=?", +params.id); if (!c) throw new HttpError(404, "Kurs topilmadi");
    const childId = +params.child;
    if (!await db.get("SELECT 1 x FROM children WHERE id=?", childId)) throw new HttpError(404, "O‘quvchi topilmadi");
    await db.tx(async (q) => {
      const ex = await enrollment(c.id, childId, q);
      await q.run("INSERT INTO enrollments(course_id,child_id,status,created_at,paid_until) VALUES(?,?,?,?,?) ON CONFLICT(course_id,child_id) DO UPDATE SET status=excluded.status", c.id, childId, st, now(), c.price > 0 ? 0 : -1);
      // Naqd to‘lov yoki bepul ruxsat: grant_days > 0 — shuncha kunga uzaytirish, -1 — cheksiz, 0 — to‘lovni bekor qilish
      if ("grant_days" in body) {
        const d = Math.round(+body.grant_days);
        const cur = ex ? ex.paid_until : 0;
        const pu = d === -1 ? -1 : d > 0 ? Math.max(now(), cur > 0 ? cur : 0) + d * 86400 : 0;
        await q.run("UPDATE enrollments SET paid_until=?, status='active' WHERE course_id=? AND child_id=?", pu, c.id, childId);
      }
    });
    return { ok: true };
  }, TCH);
  // Telefon raqami bo‘yicha o‘quvchini qo‘lda qo‘shish (shu akkauntdagi bolalardan biri tanlanadi)
  route("GET", "/api/teach/find-children", ({ query }) => {
    let d = String(query.phone || "").replace(/\D/g, ""); if (d.length === 9) d = "998" + d;
    return db.all("SELECT ch.id, ch.name, ch.grade, ch.region, a.phone FROM children ch JOIN accounts a ON a.id=ch.account_id WHERE a.phone=?", d);
  }, TCH);

  route("POST", "/api/teach/courses/:id/announcements", async ({ params, body }) => {
    const text = str(body.text, 3000); if (!text) bad("E’lon matni bo‘sh");
    await db.run("INSERT INTO announcements(course_id,text,created_at) VALUES(?,?,?)", +params.id, text, now()); return { ok: true };
  }, TCH);
  route("DELETE", "/api/teach/announcements/:id", async ({ params }) => { await db.run("DELETE FROM announcements WHERE id=?", +params.id); return { ok: true }; }, TCH);

  function lessonInput(b) {
    const title = str(b.title, 200); if (!title) bad("Dars mavzusini yozing");
    return {
      title, starts_at: Math.max(0, +b.starts_at || 0), duration_min: Math.max(10, Math.min(600, +b.duration_min || 90)),
      body: str(b.body, 50000), live_url: cleanUrl(b.live_url), hw_text: str(b.hw_text, 50000), hw_due: Math.max(0, +b.hw_due || 0),
      hw_max: Math.max(1, Math.min(1000, +b.hw_max || 10)), solutions_mode: SOL_MODES.includes(b.solutions_mode) ? b.solutions_mode : "after_due",
      published: b.published ? 1 : 0,
    };
  }
  // Materiallar ro‘yxatini tekshirish (bazaga yozishdan oldin)
  async function itemsInput(list, account) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const i of list.slice(0, 100)) {
      const kind = KINDS.includes(i.kind) ? i.kind : "material";
      const file_id = i.file_id ? (await ownFiles(account, [i.file_id]))[0] : null;
      const url = file_id ? "" : cleanUrl(i.url);
      if (!file_id && !url) bad("Material uchun fayl yoki havola kerak");
      out.push({ kind, title: str(i.title, 200), file_id, url });
    }
    return out;
  }
  async function saveItems(q, lessonId, clean) {
    if (!clean) return;
    await q.run("DELETE FROM lesson_items WHERE lesson_id=?", lessonId);
    for (const [k, i] of clean.entries()) await q.run("INSERT INTO lesson_items(lesson_id,kind,title,file_id,url,ord) VALUES(?,?,?,?,?,?)", lessonId, i.kind, i.title, i.file_id, i.url, k);
  }

  route("POST", "/api/teach/courses/:id/lessons", async ({ params, body, account }) => {
    if (!await db.get("SELECT 1 x FROM courses WHERE id=?", +params.id)) throw new HttpError(404, "Kurs topilmadi");
    const l = lessonInput(body); const its = await itemsInput(body.items, account);
    return db.tx(async (q) => {
      const r = await q.run("INSERT INTO lessons(course_id,title,starts_at,duration_min,body,live_url,hw_text,hw_due,hw_max,solutions_mode,published,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", +params.id, l.title, l.starts_at, l.duration_min, l.body, l.live_url, l.hw_text, l.hw_due, l.hw_max, l.solutions_mode, l.published, now());
      await saveItems(q, r.lastInsertRowid, its); return { id: r.lastInsertRowid };
    });
  }, TCH);
  route("PUT", "/api/teach/lessons/:id", async ({ params, body, account }) => {
    const l = lessonInput(body); const its = await itemsInput(body.items, account);
    return db.tx(async (q) => {
      const r = await q.run("UPDATE lessons SET title=?,starts_at=?,duration_min=?,body=?,live_url=?,hw_text=?,hw_due=?,hw_max=?,solutions_mode=?,published=? WHERE id=?", l.title, l.starts_at, l.duration_min, l.body, l.live_url, l.hw_text, l.hw_due, l.hw_max, l.solutions_mode, l.published, +params.id);
      if (!r.changes) throw new HttpError(404, "Dars topilmadi");
      await saveItems(q, +params.id, its); return { ok: true };
    });
  }, TCH);
  route("DELETE", "/api/teach/lessons/:id", async ({ params }) => { await db.batch(lessonDeletes("id=?", +params.id)); return { ok: true }; }, TCH);
  route("GET", "/api/teach/lessons/:id", async ({ params }) => {
    const l = await db.get("SELECT * FROM lessons WHERE id=?", +params.id); if (!l) throw new HttpError(404, "Dars topilmadi");
    const [its, students, cms] = await Promise.all([
      items(l.id),
      db.all(`SELECT ch.id child_id, ch.name, a.phone, at.joined_at, s.id sub_id, s.status, s.score, s.submitted_at
        FROM enrollments e JOIN children ch ON ch.id=e.child_id JOIN accounts a ON a.id=ch.account_id
        LEFT JOIN attendance at ON at.lesson_id=? AND at.child_id=ch.id LEFT JOIN submissions s ON s.lesson_id=? AND s.child_id=ch.id
        WHERE e.course_id=? AND e.status='active' ORDER BY ch.name`, l.id, l.id, l.course_id),
      comments(l.id),
    ]);
    return { lesson: l, items: its, students, comments: cms };
  }, TCH);

  route("GET", "/api/teach/submissions", ({ query }) => {
    const status = ["submitted", "checked", "returned"].includes(query.status) ? query.status : "";
    return db.all(`SELECT s.id, s.status, s.score, s.submitted_at, s.checked_at, l.id lesson_id, l.title lesson, l.hw_due, l.hw_max, c.id course_id, c.title course, ch.name, ch.grade
      FROM submissions s JOIN lessons l ON l.id=s.lesson_id JOIN courses c ON c.id=l.course_id JOIN children ch ON ch.id=s.child_id
      WHERE (?=0 OR c.id=?) AND (?='' OR s.status=?) AND (?=0 OR l.id=?) ORDER BY s.status='submitted' DESC, s.submitted_at DESC LIMIT 300`, +query.course || 0, +query.course || 0, status, status, +query.lesson || 0, +query.lesson || 0);
  }, TCH);
  route("GET", "/api/teach/submissions/:id", async ({ params }) => {
    const s = await db.get(`SELECT s.*, l.title lesson, l.hw_text, l.hw_due, l.hw_max, l.course_id, ch.name, ch.grade, a.phone
      FROM submissions s JOIN lessons l ON l.id=s.lesson_id JOIN children ch ON ch.id=s.child_id JOIN accounts a ON a.id=ch.account_id WHERE s.id=?`, +params.id);
    if (!s) throw new HttpError(404, "Topilmadi");
    return { ...await pubSub(s), lesson_id: s.lesson_id, lesson: s.lesson, hw_text: s.hw_text, hw_due: s.hw_due, hw_max: s.hw_max, course_id: s.course_id, name: s.name, grade: s.grade, phone: s.phone };
  }, TCH);
  route("PUT", "/api/teach/submissions/:id", async ({ params, body, account }) => {
    const s = await db.get("SELECT s.*, l.hw_max FROM submissions s JOIN lessons l ON l.id=s.lesson_id WHERE s.id=?", +params.id); if (!s) throw new HttpError(404, "Topilmadi");
    const status = ["checked", "returned"].includes(body.status) ? body.status : bad("Holat noto‘g‘ri");
    const score = body.score === "" || body.score == null ? null : +body.score;
    if (score != null && !(score >= 0 && score <= s.hw_max)) bad(`Ball 0 dan ${s.hw_max} gacha bo‘lsin`);
    if (status === "checked" && score == null) bad("Ballni kiriting");
    const fb = await ownFiles(account, body.feedback_files, 20);
    await db.run("UPDATE submissions SET status=?,score=?,feedback=?,feedback_files=?,checked_at=? WHERE id=?", status, score, str(body.feedback, 10000), JSON.stringify(fb), now(), s.id);
    return { ok: true };
  }, TCH);

  route("GET", "/api/teach/courses/:id/journal", async ({ params }) => {
    const id = +params.id;
    const [lessons, students, subs, attendance] = await Promise.all([
      db.all("SELECT id,title,starts_at,hw_max FROM lessons WHERE course_id=? ORDER BY starts_at,id", id),
      db.all("SELECT ch.id, ch.name FROM enrollments e JOIN children ch ON ch.id=e.child_id WHERE e.course_id=? AND e.status='active' ORDER BY ch.name", id),
      db.all("SELECT s.lesson_id, s.child_id, s.status, s.score FROM submissions s JOIN lessons l ON l.id=s.lesson_id WHERE l.course_id=?", id),
      db.all("SELECT a.lesson_id, a.child_id FROM attendance a JOIN lessons l ON l.id=a.lesson_id WHERE l.course_id=?", id),
    ]);
    return { lessons, students, subs, attendance };
  }, TCH);

  route("DELETE", "/api/teach/comments/:id", async ({ params }) => { await db.run("DELETE FROM lesson_comments WHERE id=?", +params.id); return { ok: true }; }, TCH);

  /* ================= TO‘LOV (Payme, Click) ================= */
  // Kalitlar muhit o‘zgaruvchilaridan (.env) olinadi. Kodda saqlanmaydi.
  const PAY = {
    payme: { id: process.env.PAYME_MERCHANT_ID || "", key: process.env.PAYME_KEY || "", test: process.env.PAYME_TEST === "1" },
    click: { service: process.env.CLICK_SERVICE_ID || "", merchant: process.env.CLICK_MERCHANT_ID || "", secret: process.env.CLICK_SECRET_KEY || "" },
  };
  const enabled = () => ({ payme: !!(PAY.payme.id && PAY.payme.key), click: !!(PAY.click.service && PAY.click.merchant && PAY.click.secret) });
  // To‘lovdan keyin qaytish: frontend manzili (SITE_URL)
  const siteUrl = (req) => (process.env.SITE_URL || req.headers.origin || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`).replace(/\/$/, "");

  // To‘lov muvaffaqiyatli bo‘lganda: o‘quvchi kursga a’zo bo‘ladi (yoki muddati uzayadi). q — tranzaksiya.
  async function deliver(q, orderId) {
    const o = await q.get("SELECT * FROM orders WHERE id=?", orderId);
    if (!o || o.status === "paid") return;
    const e = await enrollment(o.course_id, o.child_id, q);
    const cur = e ? e.paid_until : 0;
    const pu = o.days > 0 ? Math.max(now(), cur > 0 ? cur : 0) + o.days * 86400 : -1;
    await q.run("INSERT INTO enrollments(course_id,child_id,status,created_at,paid_until) VALUES(?,?,'active',?,?) ON CONFLICT(course_id,child_id) DO UPDATE SET status='active', paid_until=excluded.paid_until", o.course_id, o.child_id, now(), pu);
    await q.run("UPDATE orders SET status='paid', paid_at=? WHERE id=?", now(), o.id);
  }
  // To‘lov qaytarilganda (Payme bekor qilsa): berilgan muddat olib tashlanadi
  async function revoke(q, orderId) {
    const o = await q.get("SELECT * FROM orders WHERE id=?", orderId);
    if (!o || o.status !== "paid") return;
    const e = await enrollment(o.course_id, o.child_id, q);
    if (e) await q.run("UPDATE enrollments SET paid_until=? WHERE course_id=? AND child_id=?", o.days > 0 && e.paid_until > 0 ? Math.max(1, e.paid_until - o.days * 86400) : 0, o.course_id, o.child_id);
    await q.run("UPDATE orders SET status='refunded' WHERE id=?", o.id);
  }

  route("GET", "/api/academy/pay-options", () => enabled(), { auth: true });
  route("POST", "/api/academy/courses/:id/pay", async ({ account, params, body, req }) => {
    const child = await ownChild(account, body.child);
    const c = await db.get("SELECT * FROM courses WHERE id=? AND published=1", +params.id); if (!c) throw new HttpError(404, "Kurs topilmadi");
    if (!(c.price > 0)) bad("Bu kurs bepul");
    const e = await enrollment(c.id, child.id); if (e && e.status === "removed") bad("Kursga qo‘shilish uchun o‘qituvchiga murojaat qiling");
    const prov = body.provider; if (!enabled()[prov]) bad("Bu to‘lov usuli hozircha ulanmagan");
    const r = await db.run("INSERT INTO orders(course_id,child_id,account_id,amount,days,provider,created_at) VALUES(?,?,?,?,?,?,?)", c.id, child.id, account.id, c.price, c.access_days, prov, now());
    const id = r.lastInsertRowid;
    const back = `${siteUrl(req)}/#olymp-p${id}`;
    let url;
    if (prov === "payme") {
      const p = `m=${PAY.payme.id};ac.order_id=${id};a=${c.price * 100};c=${back};l=uz`;
      url = `${PAY.payme.test ? "https://test.paycom.uz" : "https://checkout.paycom.uz"}/${Buffer.from(p).toString("base64")}`;
    } else {
      url = `https://my.click.uz/services/pay?${new URLSearchParams({ service_id: PAY.click.service, merchant_id: PAY.click.merchant, amount: String(c.price), transaction_param: String(id), return_url: back })}`;
    }
    return { order_id: id, url };
  }, { auth: true });
  route("GET", "/api/academy/orders/:id", async ({ account, params }) => {
    const o = await db.get("SELECT o.*, c.title FROM orders o JOIN courses c ON c.id=o.course_id WHERE o.id=? AND o.account_id=?", +params.id, account.id);
    if (!o) throw new HttpError(404, "Buyurtma topilmadi");
    return { id: o.id, status: o.status, course_id: o.course_id, title: o.title, amount: o.amount, child_id: o.child_id };
  }, { auth: true });

  function readRaw(req) {
    return new Promise((res, rej) => { let size = 0; const ch = []; req.on("data", (c) => { size += c.length; if (size > 1e5) { req.destroy(); rej(new HttpError(413, "Katta")); } else ch.push(c); }); req.on("end", () => res(Buffer.concat(ch).toString("utf8"))); req.on("error", rej); });
  }

  /* ---- Payme Merchant API (JSON-RPC). Kabinetda “Endpoint URL”: https://API_MANZIL/api/pay/payme ---- */
  const PM_TIMEOUT = 12 * 3600 * 1000;
  const pmErr = (code, uz, ru, en, data) => { const e = new Error(uz); e.pm = { code, message: { uz, ru: ru || uz, en: en || uz }, data }; return e; };
  const ms = () => Date.now();
  const pmTx = (id, q = db) => q.get("SELECT * FROM payments WHERE provider='payme' AND ext_id=?", String(id));
  async function pmCheckOrder(p, q = db) {
    const oid = +((p.account || {}).order_id);
    const o = oid && await q.get("SELECT * FROM orders WHERE id=?", oid);
    if (!o) throw pmErr(-31050, "Buyurtma topilmadi", "Заказ не найден", "Order not found", "order_id");
    if (o.status !== "new") throw pmErr(-31051, "Buyurtma to‘langan yoki bekor qilingan", "Заказ уже оплачен или отменён", "Order is not available", "order_id");
    if (+p.amount !== o.amount * 100) throw pmErr(-31001, "Summa noto‘g‘ri", "Неверная сумма", "Incorrect amount");
    return o;
  }
  const pmView = (t) => ({ create_time: t.create_time, perform_time: t.perform_time || 0, cancel_time: t.cancel_time || 0, transaction: String(t.id), state: t.state, reason: t.reason ?? null });
  const pmCancelTimeout = (t) => db.batch([["UPDATE payments SET state=-1, cancel_time=?, reason=4 WHERE id=?", ms(), t.id], ["UPDATE orders SET status='cancelled' WHERE id=? AND status='new'", t.order_id]]);
  const PM = {
    async CheckPerformTransaction(p) { await pmCheckOrder(p); return { allow: true }; },
    async CreateTransaction(p) {
      const t = await pmTx(p.id);
      if (t) {
        if (t.state !== 1) throw pmErr(-31008, "Amalni bajarib bo‘lmaydi", "Невозможно выполнить операцию", "Unable to perform operation");
        if (ms() - t.create_time > PM_TIMEOUT) { await pmCancelTimeout(t); throw pmErr(-31008, "Tranzaksiya muddati o‘tgan", "Истёк срок транзакции", "Transaction expired"); }
        return { create_time: t.create_time, transaction: String(t.id), state: t.state };
      }
      return db.tx(async (q) => {
        const o = await pmCheckOrder(p, q);
        if (await q.get("SELECT 1 x FROM payments WHERE provider='payme' AND order_id=? AND state=1", o.id))
          throw pmErr(-31050, "Buyurtma bo‘yicha boshqa to‘lov kutilmoqda", "По заказу ожидается другая оплата", "Another transaction is pending", "order_id");
        const ct = ms();
        const r = await q.run("INSERT INTO payments(provider,ext_id,order_id,amount,state,create_time,ptime) VALUES('payme',?,?,?,1,?,?)", String(p.id), o.id, +p.amount, ct, +p.time || ct);
        return { create_time: ct, transaction: String(r.lastInsertRowid), state: 1 };
      });
    },
    async PerformTransaction(p) {
      const t = await pmTx(p.id); if (!t) throw pmErr(-31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found");
      if (t.state === 2) return { transaction: String(t.id), perform_time: t.perform_time, state: 2 };
      if (t.state !== 1) throw pmErr(-31008, "Amalni bajarib bo‘lmaydi", "Невозможно выполнить операцию", "Unable to perform operation");
      if (ms() - t.create_time > PM_TIMEOUT) { await pmCancelTimeout(t); throw pmErr(-31008, "Tranzaksiya muddati o‘tgan", "Истёк срок транзакции", "Transaction expired"); }
      return db.tx(async (q) => {
        const cur = await pmTx(p.id, q);
        if (cur.state === 2) return { transaction: String(cur.id), perform_time: cur.perform_time, state: 2 };
        const pt = ms();
        await q.run("UPDATE payments SET state=2, perform_time=? WHERE id=?", pt, t.id);
        await deliver(q, t.order_id);
        return { transaction: String(t.id), perform_time: pt, state: 2 };
      });
    },
    async CancelTransaction(p) {
      const t = await pmTx(p.id); if (!t) throw pmErr(-31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found");
      if (t.state !== 1 && t.state !== 2) return { transaction: String(t.id), cancel_time: t.cancel_time, state: t.state };
      const ct = ms(), ns = t.state === 1 ? -1 : -2;
      await db.tx(async (q) => {
        await q.run("UPDATE payments SET state=?, cancel_time=?, reason=? WHERE id=?", ns, ct, p.reason ?? null, t.id);
        if (ns === -1) await q.run("UPDATE orders SET status='cancelled' WHERE id=? AND status='new'", t.order_id); else await revoke(q, t.order_id);
      });
      return { transaction: String(t.id), cancel_time: ct, state: ns };
    },
    async CheckTransaction(p) { const t = await pmTx(p.id); if (!t) throw pmErr(-31003, "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found"); return pmView(t); },
    async GetStatement(p) {
      return { transactions: (await db.all("SELECT * FROM payments WHERE provider='payme' AND ptime BETWEEN ? AND ? ORDER BY ptime", +p.from || 0, +p.to || 0))
        .map((t) => ({ id: t.ext_id, time: t.ptime, amount: t.amount, account: { order_id: String(t.order_id) }, ...pmView(t) })) };
    },
  };
  route("POST", "/api/pay/payme", async ({ req }) => {
    let msg = {};
    try {
      const raw = await readRaw(req);
      const auth = String(req.headers.authorization || "");
      const cred = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf8") : "";
      if (!PAY.payme.key || cred.slice(cred.indexOf(":") + 1) !== PAY.payme.key) throw pmErr(-32504, "Ruxsat yo‘q", "Недостаточно привилегий", "Insufficient privileges");
      try { msg = JSON.parse(raw); } catch { throw pmErr(-32700, "JSON xato", "Ошибка парсинга JSON", "Parse error"); }
      const fn = Object.prototype.hasOwnProperty.call(PM, msg.method) && PM[msg.method];
      if (!fn) throw pmErr(-32601, "Metod topilmadi", "Метод не найден", "Method not found");
      return { jsonrpc: "2.0", id: msg.id ?? null, result: await fn(msg.params || {}) };
    } catch (e) {
      if (!e.pm) console.error(e);
      return { jsonrpc: "2.0", id: msg.id ?? null, error: e.pm || { code: -32400, message: { uz: "Tizim xatosi", ru: "Системная ошибка", en: "System error" } } };
    }
  }, { raw: true });

  /* ---- Click SHOP API. Kabinetda: Prepare URL https://API_MANZIL/api/pay/click/prepare, Complete URL https://API_MANZIL/api/pay/click/complete ---- */
  const md5 = (x) => crypto.createHash("md5").update(x).digest("hex");
  async function clickHandle(req, action) {
    const p = Object.fromEntries(new URLSearchParams(await readRaw(req)));
    const base = { click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id };
    const out = (error, error_note, extra = {}) => ({ ...base, ...extra, error, error_note });
    if (!enabled().click) return out(-8, "Click ulanmagan");
    const sign = md5(`${p.click_trans_id}${p.service_id}${PAY.click.secret}${p.merchant_trans_id}${action === 1 ? p.merchant_prepare_id ?? "" : ""}${p.amount}${p.action}${p.sign_time}`);
    if (sign !== String(p.sign_string || "").toLowerCase() || String(p.service_id) !== String(PAY.click.service)) return out(-1, "SIGN CHECK FAILED!");
    if (+p.action !== action) return out(-3, "Action not found");
    const o = await db.get("SELECT * FROM orders WHERE id=?", +p.merchant_trans_id);
    if (!o) return out(-5, "Order does not exist");
    if (Math.abs(parseFloat(p.amount) - o.amount) > 0.01) return out(-2, "Incorrect parameter amount");
    if (action === 0) {
      if (o.status === "paid") return out(-4, "Already paid");
      if (o.status !== "new") return out(-9, "Transaction cancelled");
      await db.run("INSERT INTO payments(provider,ext_id,order_id,amount,state,create_time) VALUES('click',?,?,?,1,?) ON CONFLICT(provider,ext_id) DO NOTHING", String(p.click_trans_id), o.id, o.amount, ms());
      const t = await db.get("SELECT * FROM payments WHERE provider='click' AND ext_id=?", String(p.click_trans_id));
      return out(0, "Success", { merchant_prepare_id: t.id });
    }
    const t = await db.get("SELECT * FROM payments WHERE id=? AND provider='click' AND order_id=?", +p.merchant_prepare_id, o.id);
    if (!t) return out(-6, "Transaction does not exist");
    if (t.state === 2 || o.status === "paid") return out(-4, "Already paid", { merchant_confirm_id: t.id });
    if (t.state < 0 || o.status !== "new") return out(-9, "Transaction cancelled");
    if (+p.error < 0) {
      await db.batch([["UPDATE payments SET state=-1, cancel_time=? WHERE id=?", ms(), t.id], ["UPDATE orders SET status='cancelled' WHERE id=? AND status='new'", o.id]]);
      return out(-9, "Transaction cancelled");
    }
    try {
      await db.tx(async (q) => { await q.run("UPDATE payments SET state=2, perform_time=? WHERE id=?", ms(), t.id); await deliver(q, o.id); });
    } catch (e) { console.error(e); return out(-7, "Failed to update user"); }
    return out(0, "Success", { merchant_confirm_id: t.id });
  }
  route("POST", "/api/pay/click/prepare", ({ req }) => clickHandle(req, 0), { raw: true });
  route("POST", "/api/pay/click/complete", ({ req }) => clickHandle(req, 1), { raw: true });

  // O‘qituvchi uchun: kurs bo‘yicha to‘lovlar ro‘yxati va to‘lov tizimlari holati
  route("GET", "/api/teach/pay-config", () => enabled(), TCH);
  route("GET", "/api/teach/courses/:id/orders", ({ params }) => db.all(`SELECT o.id, o.amount, o.days, o.provider, o.status, o.created_at, o.paid_at, ch.name, a.phone
    FROM orders o LEFT JOIN children ch ON ch.id=o.child_id LEFT JOIN accounts a ON a.id=o.account_id WHERE o.course_id=? AND o.status IN ('paid','refunded') ORDER BY o.paid_at DESC LIMIT 500`, +params.id), TCH);

  return { serveFile, isTeacher, init };
};
