// Little Star platformasi — backend (API). Ma’lumotlar bazasi: Turso (libSQL).
// Ishga tushirish:  npm start            (sozlamalar .env faylidan o‘qiladi, .env.example’ga qarang)
// Admin yaratish:   npm run create-admin -- 998901234567 ParolKamida6
"use strict";
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

// .env faylini o‘qish (agar bo‘lsa). Serverda muhit o‘zgaruvchilari to‘g‘ridan-to‘g‘ri berilsa, bu kerak emas.
try { process.loadEnvFile(path.resolve(__dirname, "..", ".env")); } catch {}

const { open } = require("./db.js");
const SCHEMA = require("./schema.js");

const ROOT = path.resolve(__dirname, "..");
const PORT = +(process.env.PORT || 3000);
const DB_URL = process.env.TURSO_DATABASE_URL || "file:" + path.join(ROOT, "data", "littlestar.db");
if (DB_URL.startsWith("file:")) fs.mkdirSync(path.dirname(DB_URL.slice(5)), { recursive: true });
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, ""); // backend manzili, masalan https://api.littlestar.uz
// Frontend joylashgan domen(lar). Vergul bilan: https://littlestar.uz,https://www.littlestar.uz  ("*" — hammaga ruxsat)
// Sayt (frontend) fayllari: build paytida frontend reposidan olinadi (scripts/fetch-frontend.sh).
// Shunda sayt va API bitta manzilda ishlaydi — CORS va alohida sozlash kerak emas.
const FRONTEND_DIR = path.resolve(ROOT, process.env.FRONTEND_DIR || "frontend/public");
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

/* ======================= MA'LUMOTLAR BAZASI ======================= */
const db = open({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const SECTIONS = {
  pm1: { name: "Prezident maktablari — 1-bosqich", grade: 4 },
  pm2: { name: "Prezident maktablari — 2-bosqich", grade: 4 },
  ixt: { name: "Ixtisoslashtirilgan maktablar", grade: 4 },
  ol3: { name: "Matematika olimpiadasi — 3-sinf", grade: 3 },
  ol4: { name: "Matematika olimpiadasi — 4-sinf", grade: 4 },
};
const REGIONS = ["Qoraqalpog‘iston Respublikasi","Andijon viloyati","Buxoro viloyati","Farg‘ona viloyati","Jizzax viloyati","Xorazm viloyati","Namangan viloyati","Navoiy viloyati","Qashqadaryo viloyati","Samarqand viloyati","Sirdaryo viloyati","Surxondaryo viloyati","Toshkent viloyati","Toshkent shahri"];

const DEFAULT_SETTINGS = {
  free_mode: "1",
  premium_sections: JSON.stringify(Object.keys(SECTIONS)),
  contact_text: "Obuna uchun Navoiy-Qorako‘l o‘quv markazi bilan bog‘laning: +998 99 381 99 99",
};

async function getSettings() {
  const s = {};
  for (const r of await db.all("SELECT key,value FROM settings")) s[r.key] = r.value;
  return {
    free_mode: s.free_mode === "1",
    premium_sections: JSON.parse(s.premium_sections || "[]"),
    contact_text: s.contact_text || "",
  };
}

/* ======================= YORDAMCHI FUNKSIYALAR ======================= */
const now = () => Math.floor(Date.now() / 1000);
function hashPass(p, salt) { return crypto.scryptSync(p, salt, 64).toString("hex"); }
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return /^998\d{9}$/.test(d) ? d : null;
}
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => { throw new HttpError(400, m); };
const str = (v, max = 100) => String(v ?? "").trim().slice(0, max);

async function newSession(accountId) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.run("INSERT INTO sessions(token,account_id,created_at) VALUES(?,?,?)", token, accountId, now());
  return token;
}
function publicAccount(a) {
  return { id: a.id, phone: a.phone, email: a.email || null, parent_name: a.parent_name, role: a.role, premium_until: a.premium_until };
}
function hasAccess(s, account, section) {
  if (s.free_mode) return true;
  if (!s.premium_sections.includes(section)) return true;
  if (!account) return false;
  if (account.role === "admin") return true;
  return (account.premium_until || 0) > now();
}

// Oddiy so‘rov cheklovi (kirish/ro‘yxatdan o‘tish uchun)
const hits = new Map();
function rateLimit(key, max = 20, windowSec = 600) {
  const t = now(); const h = (hits.get(key) || []).filter((x) => x > t - windowSec);
  if (h.length >= max) throw new HttpError(429, "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.");
  h.push(t); hits.set(key, h);
}

/* ======================= REYTING ======================= */
// Reytingda har bir testning BIRINCHI yakunlangan urinishi hisoblanadi (adolatli bo‘lishi uchun).
function firstAttemptsSQL(extraWhere = "") {
  return `WITH firsts AS (
    SELECT a.child_id, a.test_id, a.correct, a.total, a.time_sec,
           ROW_NUMBER() OVER (PARTITION BY a.child_id, a.test_id ORDER BY a.finished_at) rn
    FROM attempts a JOIN tests t ON t.id=a.test_id
    WHERE a.status='done' ${extraWhere})
  SELECT * FROM firsts WHERE rn=1`;
}
async function testRank(testId, childId) {
  const rows = await db.all(firstAttemptsSQL("AND a.test_id=?"), testId);
  rows.sort((x, y) => y.correct - x.correct || x.time_sec - y.time_sec);
  const i = rows.findIndex((r) => r.child_id === childId);
  return { place: i < 0 ? null : i + 1, total: rows.length };
}
async function sectionBoard(section, { grade = 0, region = "" } = {}) {
  const rows = await db.all(`SELECT c.id, c.name, c.region, c.district, c.grade, c.school,
      SUM(f.correct) score, SUM(f.total) max, COUNT(*) tests, SUM(f.time_sec) time
    FROM (${firstAttemptsSQL("AND t.section=?")}) f JOIN children c ON c.id=f.child_id
    WHERE (?=0 OR c.grade=?) AND (?='' OR c.region=?)
    GROUP BY c.id ORDER BY score DESC, time ASC`, section, grade, grade, region, region);
  return rows.map((r, i) => ({ ...r, place: i + 1 }));
}

/* ======================= MARSHRUTLAR (API) ======================= */
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = []; const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, re, keys, handler, ...opts });
};

route("GET", "/api/health", async () => { await db.get("SELECT 1 ok"); return { ok: true }; });

// --- Kirish ---
route("POST", "/api/auth/register", async ({ body, ip }) => {
  rateLimit("reg:" + ip, 60); // o‘quv markazida ko‘p oila bitta IP dan kirishi mumkin
  const phone = normPhone(body.phone); if (!phone) bad("Telefon raqam noto‘g‘ri. Masalan: 90 123 45 67");
  const pass = String(body.password || ""); if (pass.length < 6) bad("Parol kamida 6 belgidan iborat bo‘lsin");
  if (await db.get("SELECT 1 x FROM accounts WHERE phone=?", phone)) bad("Bu raqam allaqachon ro‘yxatdan o‘tgan. Kirish bo‘limidan foydalaning.");
  const salt = crypto.randomBytes(16).toString("hex");
  const r = await db.run("INSERT INTO accounts(phone,pass_hash,salt,parent_name,created_at) VALUES(?,?,?,?,?)", phone, hashPass(pass, salt), salt, str(body.parent_name, 60), now());
  const a = await db.get("SELECT * FROM accounts WHERE id=?", r.lastInsertRowid);
  return { token: await newSession(a.id), account: publicAccount(a) };
});
// Kirish: telefon raqam yoki email (admin email bilan kiradi)
route("POST", "/api/auth/login", async ({ body, ip }) => {
  const login = String(body.phone || body.login || "").trim();
  const email = login.includes("@") ? login.toLowerCase() : null;
  const phone = email ? null : normPhone(login);
  rateLimit("login:" + ip + ":" + (email || phone), 10); rateLimit("loginip:" + ip, 300); rateLimit("loginacc:" + (email || phone), 30, 3600);
  const a = email ? await db.get("SELECT * FROM accounts WHERE email=?", email) : phone && await db.get("SELECT * FROM accounts WHERE phone=?", phone);
  if (!a || hashPass(String(body.password || ""), a.salt) !== a.pass_hash) throw new HttpError(401, "Telefon raqam yoki parol noto‘g‘ri");
  return { token: await newSession(a.id), account: publicAccount(a) };
});
route("POST", "/api/auth/logout", async ({ token }) => { await db.run("DELETE FROM sessions WHERE token=?", token); return { ok: true }; }, { auth: true });

route("GET", "/api/meta", async () => {
  const s = await getSettings();
  return { sections: Object.entries(SECTIONS).map(([id, v]) => ({ id, ...v, premium: !s.free_mode && s.premium_sections.includes(id) })), regions: REGIONS, free_mode: s.free_mode, contact_text: s.contact_text };
});

route("GET", "/api/me", async ({ account }) => {
  const children = await db.all("SELECT id,name,grade,region,district,school FROM children WHERE account_id=? ORDER BY id", account.id);
  const s = await getSettings();
  const access = Object.fromEntries(Object.keys(SECTIONS).map((k) => [k, hasAccess(s, account, k)]));
  return { account: publicAccount(account), children, access };
}, { auth: true });

// --- Bolalar profillari ---
function childInput(b) {
  const name = str(b.name, 50); if (name.length < 2) bad("Bolaning ism-familiyasini yozing");
  const grade = +b.grade; if (!(Number.isInteger(grade) && grade >= 1 && grade <= 11)) bad("Sinfni tanlang");
  const region = str(b.region, 60); if (!REGIONS.includes(region)) bad("Viloyatni tanlang");
  return { name, grade, region, district: str(b.district, 60), school: str(b.school, 80) };
}
route("POST", "/api/children", async ({ account, body }) => {
  const c = childInput(body);
  if ((await db.get("SELECT COUNT(*) n FROM children WHERE account_id=?", account.id)).n >= 5) bad("Bitta akkauntga ko‘pi bilan 5 ta bola qo‘shish mumkin");
  const r = await db.run("INSERT INTO children(account_id,name,grade,region,district,school,created_at) VALUES(?,?,?,?,?,?,?)", account.id, c.name, c.grade, c.region, c.district, c.school, now());
  return { id: r.lastInsertRowid };
}, { auth: true });
route("PUT", "/api/children/:id", async ({ account, body, params }) => {
  const c = childInput(body);
  const r = await db.run("UPDATE children SET name=?,grade=?,region=?,district=?,school=? WHERE id=? AND account_id=?", c.name, c.grade, c.region, c.district, c.school, +params.id, account.id);
  if (!r.changes) throw new HttpError(404, "Topilmadi");
  return { ok: true };
}, { auth: true });
route("DELETE", "/api/children/:id", async ({ account, params }) => {
  const c = await db.get("SELECT id FROM children WHERE id=? AND account_id=?", +params.id, account.id);
  if (!c) return { ok: true };
  // Bola bilan bog‘liq natijalar ham o‘chadi (to‘lov yozuvlari hisob uchun saqlanadi)
  await db.batch([
    ["DELETE FROM attempts WHERE child_id=?", c.id], ["DELETE FROM enrollments WHERE child_id=?", c.id],
    ["DELETE FROM submissions WHERE child_id=?", c.id], ["DELETE FROM attendance WHERE child_id=?", c.id],
    ["DELETE FROM children WHERE id=?", c.id],
  ]);
  return { ok: true };
}, { auth: true });

async function ownChild(account, id) {
  const c = await db.get("SELECT * FROM children WHERE id=? AND account_id=?", +id, account.id);
  if (!c) bad("Bola profilini tanlang"); return c;
}

// --- Testlar ---
route("GET", "/api/tests", async ({ account, query }) => {
  const section = query.section; if (!SECTIONS[section]) bad("Bo‘lim noto‘g‘ri");
  const child = await ownChild(account, query.child);
  const tests = await db.all(`SELECT t.id,t.title,t.grade,t.duration_min,(SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id) count
    FROM tests t WHERE t.section=? AND t.published=1 ORDER BY t.sort,t.id`, section);
  const all = await db.all("SELECT test_id,correct,total,time_sec,finished_at FROM attempts WHERE child_id=? AND status='done' ORDER BY finished_at", child.id);
  for (const t of tests) {
    const at = all.filter((x) => x.test_id === t.id).map(({ test_id, ...x }) => x);
    t.attempts = at.length; t.first = at[0] || null;
    t.best = at.reduce((m, x) => (!m || x.correct > m.correct ? x : m), null);
  }
  return { section: { id: section, ...SECTIONS[section] }, access: hasAccess(await getSettings(), account, section), tests };
}, { auth: true });

route("POST", "/api/tests/:id/start", async ({ account, params, body }) => {
  const child = await ownChild(account, body.child);
  const t = await db.get("SELECT * FROM tests WHERE id=? AND published=1", +params.id); if (!t) throw new HttpError(404, "Test topilmadi");
  const s = await getSettings();
  if (!hasAccess(s, account, t.section)) throw new HttpError(402, s.contact_text || "Bu bo‘lim pullik");
  const qs = (await db.all("SELECT id,subject,text,image,options FROM questions WHERE test_id=? ORDER BY ord,id", t.id))
    .map((q) => ({ ...q, options: JSON.parse(q.options) }));
  const r = await db.run("INSERT INTO attempts(child_id,test_id,started_at,total) VALUES(?,?,?,?)", child.id, t.id, now(), qs.length);
  return { attempt_id: r.lastInsertRowid, test: { id: t.id, title: t.title, section: t.section, duration_min: t.duration_min }, questions: qs, server_time: now() };
}, { auth: true });

route("POST", "/api/attempts/:id/submit", async ({ account, params, body }) => {
  const at = await db.get(`SELECT a.*, t.duration_min, t.section, t.title FROM attempts a JOIN tests t ON t.id=a.test_id
    JOIN children c ON c.id=a.child_id WHERE a.id=? AND c.account_id=?`, +params.id, account.id);
  if (!at) throw new HttpError(404, "Urinish topilmadi");
  const qs = await db.all("SELECT id,subject,text,image,options,correct,explanation FROM questions WHERE test_id=? ORDER BY ord,id", at.test_id);
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, qs.length) : [];
  if (at.status !== "done") {
    let correct = 0; qs.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
    const time = Math.min(now() - at.started_at, at.duration_min * 60);
    await db.run("UPDATE attempts SET status='done',finished_at=?,time_sec=?,correct=?,total=?,answers=? WHERE id=? AND status<>'done'", now(), time, correct, qs.length, JSON.stringify(answers), at.id);
  }
  const done = await db.get("SELECT * FROM attempts WHERE id=?", at.id);
  const saved = JSON.parse(done.answers || "[]");
  const isFirst = (await db.get("SELECT id FROM attempts WHERE child_id=? AND test_id=? AND status='done' ORDER BY finished_at LIMIT 1", at.child_id, at.test_id)).id === at.id;
  const child = await db.get("SELECT * FROM children WHERE id=?", at.child_id);
  const [board, regionBoard, test_rank] = await Promise.all([sectionBoard(at.section), sectionBoard(at.section, { region: child.region }), testRank(at.test_id, child.id)]);
  const me = board.find((r) => r.id === child.id);
  const meReg = regionBoard.find((r) => r.id === child.id);
  return {
    correct: done.correct, total: done.total, time_sec: done.time_sec, counted: isFirst, test_rank,
    section_rank: { place: me ? me.place : null, total: board.length, region_place: meReg ? meReg.place : null, region_total: regionBoard.length },
    review: qs.map((q, i) => ({ subject: q.subject, text: q.text, image: q.image, options: JSON.parse(q.options), correct: q.correct, chosen: saved[i] ?? null, explanation: q.explanation })),
  };
}, { auth: true });

// --- Reyting ---
route("GET", "/api/leaderboard", async ({ query, account }) => {
  const section = query.section; if (!SECTIONS[section]) bad("Bo‘lim noto‘g‘ri");
  const grade = +query.grade || 0; const region = REGIONS.includes(query.region) ? query.region : "";
  const board = await sectionBoard(section, { grade, region });
  let mine = [];
  if (account) { const ids = (await db.all("SELECT id FROM children WHERE account_id=?", account.id)).map((r) => r.id); mine = board.filter((r) => ids.includes(r.id)); }
  const strip = (r) => ({ place: r.place, name: r.name, region: r.region, district: r.district, grade: r.grade, school: r.school, score: r.score, max: r.max, tests: r.tests, time: r.time, id: r.id });
  return { total: board.length, top: board.slice(0, 100).map(strip), mine: mine.map(strip) };
}, { optionalAuth: true });

/* ======================= ADMIN ======================= */
const A = { auth: true, admin: true };
route("GET", "/api/admin/stats", async () => {
  const n = async (sql, ...a) => (await db.get(sql, ...a)).n;
  const day = now() - 86400;
  const [accounts, children, attempts, attempts_today, new_today, premium, tests, questions, by_region, settings] = await Promise.all([
    n("SELECT COUNT(*) n FROM accounts"), n("SELECT COUNT(*) n FROM children"),
    n("SELECT COUNT(*) n FROM attempts WHERE status='done'"), n("SELECT COUNT(*) n FROM attempts WHERE status='done' AND finished_at>?", day),
    n("SELECT COUNT(*) n FROM accounts WHERE created_at>?", day), n("SELECT COUNT(*) n FROM accounts WHERE premium_until>?", now()),
    n("SELECT COUNT(*) n FROM tests"), n("SELECT COUNT(*) n FROM questions"),
    db.all("SELECT region, COUNT(*) n FROM children GROUP BY region ORDER BY n DESC"), getSettings(),
  ]);
  return { accounts, children, attempts, attempts_today, new_today, premium, tests, questions, by_region, settings, sections: SECTIONS };
}, A);
route("PUT", "/api/admin/settings", async ({ body }) => {
  const SET = "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
  const st = [];
  if ("free_mode" in body) st.push([SET, "free_mode", body.free_mode ? "1" : "0"]);
  if (Array.isArray(body.premium_sections)) st.push([SET, "premium_sections", JSON.stringify(body.premium_sections.filter((s) => SECTIONS[s]))]);
  if ("contact_text" in body) st.push([SET, "contact_text", str(body.contact_text, 300)]);
  if (st.length) await db.batch(st);
  return getSettings();
}, A);

route("GET", "/api/admin/tests", ({ query }) => db.all(`SELECT t.*, (SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id) count,
  (SELECT COUNT(*) FROM attempts a WHERE a.test_id=t.id AND a.status='done') attempts FROM tests t WHERE (?='' OR section=?) ORDER BY section,sort,id`, query.section || "", query.section || ""), A);
function testInput(b) {
  if (!SECTIONS[b.section]) bad("Bo‘limni tanlang");
  const title = str(b.title, 120); if (!title) bad("Test nomini yozing");
  return { section: b.section, title, grade: +b.grade || SECTIONS[b.section].grade, duration_min: Math.max(1, Math.min(300, +b.duration_min || 60)), published: b.published ? 1 : 0, sort: +b.sort || 0 };
}
route("POST", "/api/admin/tests", async ({ body }) => {
  const t = testInput(body);
  const r = await db.run("INSERT INTO tests(section,title,grade,duration_min,published,sort,created_at) VALUES(?,?,?,?,?,?,?)", t.section, t.title, t.grade, t.duration_min, t.published, t.sort, now());
  return { id: r.lastInsertRowid };
}, A);
route("PUT", "/api/admin/tests/:id", async ({ body, params }) => {
  const t = testInput(body);
  await db.run("UPDATE tests SET section=?,title=?,grade=?,duration_min=?,published=?,sort=? WHERE id=?", t.section, t.title, t.grade, t.duration_min, t.published, t.sort, +params.id);
  return { ok: true };
}, A);
route("DELETE", "/api/admin/tests/:id", async ({ params }) => {
  const id = +params.id;
  await db.batch([["DELETE FROM questions WHERE test_id=?", id], ["DELETE FROM attempts WHERE test_id=?", id], ["DELETE FROM tests WHERE id=?", id]]);
  return { ok: true };
}, A);
route("GET", "/api/admin/tests/:id", async ({ params }) => {
  const t = await db.get("SELECT * FROM tests WHERE id=?", +params.id); if (!t) throw new HttpError(404, "Topilmadi");
  t.questions = (await db.all("SELECT * FROM questions WHERE test_id=? ORDER BY ord,id", t.id)).map((q) => ({ ...q, options: JSON.parse(q.options) }));
  return t;
}, A);
route("PUT", "/api/admin/tests/:id/questions", async ({ body, params }) => {
  const id = +params.id; if (!await db.get("SELECT 1 x FROM tests WHERE id=?", id)) throw new HttpError(404, "Topilmadi");
  const list = Array.isArray(body.questions) ? body.questions : bad("Savollar ro‘yxati kerak");
  const clean = list.map((q, i) => {
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => str(o, 500)).filter((o) => o !== "");
    if (!str(q.text, 3000) && !q.image) bad(`${i + 1}-savol matni bo‘sh`);
    if (options.length < 2) bad(`${i + 1}-savolda kamida 2 ta javob varianti bo‘lsin`);
    const correct = +q.correct; if (!(correct >= 0 && correct < options.length)) bad(`${i + 1}-savolda to‘g‘ri javob belgilanmagan`);
    const image = String(q.image || ""); if (image.length > 600000) bad(`${i + 1}-savoldagi rasm juda katta (500 KB gacha)`);
    return { subject: str(q.subject, 40) || "Matematika", text: str(q.text, 3000), image, options, correct, explanation: str(q.explanation, 2000) };
  });
  await db.batch([
    ["DELETE FROM questions WHERE test_id=?", id],
    ...clean.map((q, i) => ["INSERT INTO questions(test_id,ord,subject,text,image,options,correct,explanation) VALUES(?,?,?,?,?,?,?,?)", id, i + 1, q.subject, q.text, q.image, JSON.stringify(q.options), q.correct, q.explanation]),
  ]);
  return { ok: true, count: clean.length };
}, A);

route("GET", "/api/admin/users", ({ query }) => {
  const q = "%" + String(query.q || "").replace(/[%_]/g, "") + "%";
  return db.all(`SELECT a.id,a.phone,a.email,a.parent_name,a.role,a.premium_until,a.created_at,
      (SELECT GROUP_CONCAT(c.name || ' (' || c.grade || '-sinf, ' || c.region || ')', '; ') FROM children c WHERE c.account_id=a.id) kids,
      (SELECT COUNT(*) FROM attempts t JOIN children c ON c.id=t.child_id WHERE c.account_id=a.id AND t.status='done') attempts
    FROM accounts a WHERE a.phone LIKE ? OR a.email LIKE ? OR a.parent_name LIKE ? OR EXISTS(SELECT 1 FROM children c WHERE c.account_id=a.id AND c.name LIKE ?)
    ORDER BY a.id DESC LIMIT 200`, q, q, q, q);
}, A);
route("PUT", "/api/admin/users/:id", async ({ body, params, account }) => {
  const id = +params.id; const u = await db.get("SELECT * FROM accounts WHERE id=?", id); if (!u) throw new HttpError(404, "Topilmadi");
  if ("premium_days" in body) { const d = +body.premium_days; const base = Math.max(now(), u.premium_until || 0); await db.run("UPDATE accounts SET premium_until=? WHERE id=?", d > 0 ? base + d * 86400 : 0, id); }
  if ("role" in body && ["user", "teacher", "admin"].includes(body.role)) { if (id === account.id && body.role !== "admin") bad("O‘zingizni adminlikdan chiqara olmaysiz"); await db.run("UPDATE accounts SET role=? WHERE id=?", body.role, id); }
  if (body.new_password) {
    const p = String(body.new_password); if (p.length < 6) bad("Parol kamida 6 belgi");
    const salt = crypto.randomBytes(16).toString("hex");
    await db.batch([["UPDATE accounts SET pass_hash=?,salt=? WHERE id=?", hashPass(p, salt), salt, id], ["DELETE FROM sessions WHERE account_id=?", id]]);
  }
  return { ok: true };
}, A);

/* ======================= OLIMPIADA AKADEMIYASI ======================= */
const ACADEMY = require("./academy.js")({ db, route, HttpError, bad, str, now, PUBLIC_URL });

/* ======================= HTTP SERVER ======================= */
function readBody(req) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 5e6) { rej(new HttpError(413, "So‘rov juda katta")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!size) return res({}); try { res(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { rej(new HttpError(400, "JSON noto‘g‘ri")); } });
    req.on("error", rej);
  });
}
// CORS: frontend boshqa domenda joylashgani uchun brauzerga ruxsat beramiz
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const ok = CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(origin);
  if (!ok) return;
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGINS.includes("*") ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.setHeader("Access-Control-Max-Age", "86400");
}
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(body);
}

/* ---- Saytning statik fayllari ---- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const hasFrontend = () => fs.existsSync(path.join(FRONTEND_DIR, "index.html"));
function serveStatic(req, res, pathname) {
  let p; try { p = decodeURIComponent(pathname); } catch { p = "/"; }
  if (p === "/" || p === "") p = "/index.html";
  if (p === "/admin") p = "/admin.html";
  // Sayt va API bitta manzilda: API manzili bo‘sh (shu domen)
  if (p === "/config.js") { res.writeHead(200, { "Content-Type": MIME[".js"], "Cache-Control": "no-cache" }); return res.end('window.LS_API = "";\n'); }
  const file = path.normalize(path.join(FRONTEND_DIR, p));
  if (!file.startsWith(FRONTEND_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(FRONTEND_DIR, "index.html");
    const ext = path.extname(target);
    const noCache = [".html", ".webmanifest", ".js"].includes(ext);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": noCache ? "no-cache" : "public, max-age=604800", "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith("/files/") && (req.method === "GET" || req.method === "HEAD")) return ACADEMY.serveFile(req, res, url.pathname);
  if (!url.pathname.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD")) {
    if (hasFrontend()) return serveStatic(req, res, url.pathname);
    if (url.pathname === "/") return send(res, 200, { name: "Little Star API", ok: true });
  }
  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, "Topilmadi");
    const m = url.pathname.match(r.re); const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const auth = req.headers.authorization || "";
    const token = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : null;
    let account = null;
    if (token && (r.auth || r.optionalAuth)) account = (await db.get("SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=?", token)) || null;
    if (r.auth && !account) throw new HttpError(401, "Iltimos, akkauntga kiring");
    if (r.admin && account.role !== "admin") throw new HttpError(403, "Faqat admin uchun");
    if (r.teacher && !ACADEMY.isTeacher(account)) throw new HttpError(403, "Faqat o‘qituvchi uchun");
    const body = r.raw ? {} : ["POST", "PUT"].includes(req.method) ? await readBody(req) : {};
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
    const out = await r.handler({ req, body, params, query: Object.fromEntries(url.searchParams), account, token, ip });
    send(res, 200, out);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.code || 500, { error: e instanceof HttpError ? e.message : "Serverda xatolik" });
  }
});

/* ======================= ISHGA TUSHIRISH ======================= */
// Admin akkaunti Environment’dagi ADMIN_PHONE va ADMIN_PASSWORD dan yaratiladi (parol kodda/GitHub’da saqlanmaydi).
// Shu telefon raqam va parol bilan kirgan odam admin bo‘ladi. Raqam saytda avval ro‘yxatdan o‘tgan bo‘lsa,
// o‘sha akkaunt admin qilinadi. Parol o‘zgartirilsa, keyingi ishga tushishda yangilanadi.
async function ensureAdmin() {
  const raw = String(process.env.ADMIN_PHONE || "").trim();
  const pass = String(process.env.ADMIN_PASSWORD || "");
  if (!raw || !pass) return;
  const phone = normPhone(raw);
  if (!phone) { console.warn("ADMIN_PHONE noto‘g‘ri (masalan: 998901234567):", raw); return; }
  const ex = await db.get("SELECT * FROM accounts WHERE phone=?", phone);
  if (ex) {
    if (ex.role !== "admin" || hashPass(pass, ex.salt) !== ex.pass_hash) {
      const salt = crypto.randomBytes(16).toString("hex");
      await db.batch([["UPDATE accounts SET role='admin', pass_hash=?, salt=? WHERE id=?", hashPass(pass, salt), salt, ex.id], ["DELETE FROM sessions WHERE account_id=?", ex.id]]);
      console.log("Admin yangilandi: +" + phone);
    }
    return;
  }
  const salt = crypto.randomBytes(16).toString("hex");
  await db.run("INSERT INTO accounts(phone,pass_hash,salt,parent_name,role,created_at) VALUES(?,?,?,?,?,?)", phone, hashPass(pass, salt), salt, "Admin", "admin", now());
  console.log("Admin yaratildi: +" + phone);
}

async function init() {
  await db.exec(SCHEMA);
  // Eski bazada email ustuni bo‘lmasa, qo‘shiladi
  if (!(await db.all("PRAGMA table_info(accounts)")).some((c) => c.name === "email")) await db.run("ALTER TABLE accounts ADD COLUMN email TEXT");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)");
  await db.batch(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ["INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", k, v]));
  if ((await db.get("SELECT COUNT(*) n FROM tests")).n === 0) {
    await require("./seed.js").seed(db);
    console.log("Namunaviy testlar qo‘shildi.");
  }
  await ACADEMY.init();
  await ensureAdmin();
}

async function main() {
  await init();
  const args = process.argv.slice(2);
  if (args[0] === "--create-admin") {
    const phone = normPhone(args[1]); const pass = args[2] || "";
    if (!phone || pass.length < 6) { console.log("Foydalanish: npm run create-admin -- 998901234567 ParolKamida6"); process.exit(1); }
    const ex = await db.get("SELECT * FROM accounts WHERE phone=?", phone);
    const salt = crypto.randomBytes(16).toString("hex");
    if (ex) await db.run("UPDATE accounts SET role='admin', pass_hash=?, salt=? WHERE id=?", hashPass(pass, salt), salt, ex.id);
    else await db.run("INSERT INTO accounts(phone,pass_hash,salt,parent_name,role,created_at) VALUES(?,?,?,?,?,?)", phone, hashPass(pass, salt), salt, "Admin", "admin", now());
    console.log("Admin tayyor:", phone); process.exit(0);
  }
  server.requestTimeout = 4 * 3600 * 1000; // katta video yuklash uchun
  server.listen(PORT, () => console.log(`Little Star API: http://localhost:${PORT}  (baza: ${DB_URL.startsWith("file:") ? "lokal fayl" : "Turso"})`));
}
main().catch((e) => { console.error("Ishga tushirishda xato:", e.message); process.exit(1); });
