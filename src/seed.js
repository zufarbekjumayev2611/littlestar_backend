// Namunaviy test variantlari. Savollar shablonlardan hisoblab tuziladi (javoblar dastur bilan hisoblanadi).
// Haqiqiy imtihon savollarini admin paneldan qo‘shish/almashtirish mumkin.
"use strict";

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
class G {
  constructor(seed) { this.r = mulberry32(seed); }
  int(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  sample(a, n) { return this.shuffle(a).slice(0, n); }
}
const fmt = (n) => (Math.abs(n) >= 10000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : String(n));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function near(g, ans) {
  const c = [1, -1, 2, -2, 10, -10, 3, -3, 5, -5];
  if (ans >= 50) c.push(Math.round(ans * 0.1), -Math.round(ans * 0.1));
  if (ans >= 200) c.push(100, -100);
  let cand = g.shuffle(c).map((d) => ans + d);
  const s = String(ans); if (s.length >= 2) { const sw = +(s.slice(0, -2) + s.slice(-1) + s.slice(-2, -1)); cand.unshift(sw); }
  cand = [...new Set(cand)].filter((x) => x > 0 && x !== ans);
  let k = 4; while (cand.length < 3) cand.push(ans + k++);
  return cand.slice(0, 3);
}
function numQ(g, text, ans, explanation, unit = "") {
  const opts = g.shuffle([ans, ...near(g, ans)]);
  return { text, options: opts.map((v) => fmt(v) + (unit ? (unit === "°" ? "" : " ") + unit : "")), correct: opts.indexOf(ans), explanation };
}
function txtQ(g, text, ans, wrongs, explanation) {
  const opts = g.shuffle([ans, ...wrongs.slice(0, 3)]);
  return { text, options: opts, correct: opts.indexOf(ans), explanation };
}
const DAYS = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ---------------- MATEMATIKA: yengil ---------------- */
const EASY = [
  (g, g3) => { const a = g3 ? g.int(100, 500) : g.int(200, 900), b = g3 ? g.int(50, 300) : g.int(100, 600), c = g.int(20, Math.min(a + b - 10, g3 ? 400 : 800)); const s = a + b; return numQ(g, `${a} + ${b} − ${c} = ?`, s - c, `${a} + ${b} = ${s}; ${s} − ${c} = ${s - c}`); },
  (g, g3) => { const a = g3 ? g.int(11, 40) : g.int(12, 99), b = g3 ? g.int(2, 6) : g.int(3, 9); return numQ(g, `${a} × ${b} = ?`, a * b, `${a} × ${b} = ${a * b}`); },
  (g, g3) => { const b = g3 ? g.int(2, 6) : g.int(3, 9), q = g3 ? g.int(11, 50) : g.int(12, 120), a = b * q; return numQ(g, `${a} : ${b} = ?`, q, `${b} × ${q} = ${a}, demak ${a} : ${b} = ${q}`); },
  (g, g3) => { const a = g.int(10, 99), b = g.int(2, 9), c = g.int(2, 12);
    if (g.r() < 0.5) return numQ(g, `${a} + ${b} × ${c} = ?`, a + b * c, `Avval ko‘paytiriladi: ${b} × ${c} = ${b * c}; keyin ${a} + ${b * c} = ${a + b * c}`);
    const a2 = g.int(3, 30); return numQ(g, `(${a2} + ${b}) × ${c} = ?`, (a2 + b) * c, `Avval qavs ichi: ${a2} + ${b} = ${a2 + b}; keyin ${a2 + b} × ${c} = ${(a2 + b) * c}`); },
  (g) => { const k = g.int(0, 2);
    if (k === 0) { const x = g.int(2, 9), y = g.int(5, 95); return numQ(g, `${x} m ${y} sm = ? sm`, 100 * x + y, `1 m = 100 sm, ${x} m = ${100 * x} sm; ${100 * x} + ${y} = ${100 * x + y}`); }
    if (k === 1) { const h = g.int(2, 5), m = g.int(5, 55); return numQ(g, `${h} soat ${m} minut = ? minut`, 60 * h + m, `1 soat = 60 minut, ${h} soat = ${60 * h} minut; ${60 * h} + ${m} = ${60 * h + m}`); }
    const x = g.int(2, 9), y = g.int(50, 950); return numQ(g, `${x} kg ${y} g = ? g`, 1000 * x + y, `1 kg = 1000 g; ${1000 * x} + ${y} = ${1000 * x + y}`); },
  (g) => { const a = g.int(6, 30), b = g.int(3, a - 1); return numQ(g, `To‘g‘ri to‘rtburchakning bo‘yi ${a} sm, eni ${b} sm. Uning perimetrini toping.`, 2 * (a + b), `P = (${a} + ${b}) × 2 = ${2 * (a + b)} sm`, "sm"); },
  (g, g3) => { const a = g3 ? g.int(50, 400) : g.int(100, 700), b = g3 ? g.int(20, 300) : g.int(50, 400);
    if (g.r() < 0.5) return numQ(g, `? + ${b} = ${a + b}`, a, `Noma’lum qo‘shiluvchi: ${a + b} − ${b} = ${a}`);
    return numQ(g, `${a + b} − ? = ${a}`, b, `Noma’lum ayriluvchi: ${a + b} − ${a} = ${b}`); },
  (g) => { const f = g.pick([
      ["Eng katta uch xonali son bilan eng kichik ikki xonali sonning ayirmasini toping.", 989, "999 − 10 = 989"],
      ["Eng kichik uch xonali son bilan eng katta ikki xonali sonning yig‘indisini toping.", 199, "100 + 99 = 199"],
      ["Eng kichik to‘rt xonali son eng katta uch xonali sondan nechtaga katta?", 1, "1000 − 999 = 1"],
      ["Raqamlari har xil bo‘lgan eng kichik uch xonali sonni toping.", 102, "Yuzlar xonasiga 1, o‘nlarga 0, birlarga 2 qo‘yiladi: 102"],
      ["Raqamlari har xil bo‘lgan eng katta uch xonali sonni toping.", 987, "9, 8, 7 raqamlari: 987"],
      ["Eng katta ikki xonali juft son bilan eng kichik ikki xonali toq sonning ayirmasini toping.", 87, "98 − 11 = 87"]]);
    return numQ(g, f[0], f[1], f[2]); },
];

/* ---------------- MATEMATIKA: o‘rta ---------------- */
const MEDIUM = [
  (g, g3) => { const d = g.int(2, g3 ? 6 : 9) * 500, dr = g.int(1, 4) * 500, n1 = g.int(2, 5), n2 = g.int(2, 4); const ans = n1 * d + n2 * (d + dr);
    return numQ(g, `Daftar ${fmt(d)} so‘m, ruchka undan ${fmt(dr)} so‘m qimmat. ${n1} ta daftar va ${n2} ta ruchka uchun qancha pul to‘lanadi?`, ans, `Ruchka: ${d} + ${dr} = ${d + dr} so‘m. ${n1} × ${d} + ${n2} × ${d + dr} = ${n1 * d} + ${n2 * (d + dr)} = ${ans} so‘m`, "so‘m"); },
  (g) => { const v = g.int(8, 20), t = g.int(2, 5);
    if (g.r() < 0.5) return numQ(g, `Velosipedchi soatiga ${v} km tezlik bilan ${t} soat yurdi. U qancha masofani bosib o‘tdi?`, v * t, `Masofa = tezlik × vaqt = ${v} × ${t} = ${v * t} km`, "km");
    const v2 = g.int(4, 9) * 10, s = v2 * t; return numQ(g, `Avtomobil ${s} km yo‘lni soatiga ${v2} km tezlik bilan bosib o‘tdi. U necha soat yo‘l yurgan?`, t, `Vaqt = masofa : tezlik = ${s} : ${v2} = ${t} soat`, "soat"); },
  (g) => { const a = g.int(4, 15), b = g.int(2, a - 1), P = 2 * (a + b); return numQ(g, `To‘g‘ri to‘rtburchakning perimetri ${P} sm, bo‘yi ${a} sm. Uning yuzini toping.`, a * b, `Eni: ${P} : 2 − ${a} = ${b} sm. Yuza: ${a} × ${b} = ${a * b} kv sm`, "kv sm"); },
  (g) => { const x = g.int(3, 30), a = g.int(2, 9), b = g.int(5, 50); return numQ(g, `x × ${a} + ${b} = ${x * a + b} bo‘lsa, x nechaga teng?`, x, `x × ${a} = ${x * a + b} − ${b} = ${x * a}; x = ${x * a} : ${a} = ${x}`); },
  (g, g3) => { const den = g.pick(g3 ? [2, 3, 4, 5] : [3, 4, 5, 6, 8, 10]), num = g3 ? 1 : g.int(1, den - 1), base = den * g.int(5, g3 ? 20 : 40); const part = (base / den) * num;
    return numQ(g, `${base} ning ${num}/${den} qismini toping.`, part, `${base} : ${den} = ${base / den}` + (num > 1 ? `; ${base / den} × ${num} = ${part}` : "")); },
  (g) => { const h = g.int(8, 11), m = g.pick([0, 10, 15, 20, 30]), dur = g.pick([35, 40, 45]), brk = g.pick([5, 10, 15]);
    const tot = h * 60 + m + dur + brk; const T = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
    const wr = [tot - brk, tot + 5, tot - 10, tot + 10].filter((x) => x !== tot).map(T);
    return txtQ(g, `Birinchi dars soat ${T(h * 60 + m)} da boshlandi va ${dur} minut davom etdi. Keyin ${brk} minut tanaffus bo‘ldi. Ikkinchi dars soat nechada boshlandi?`, T(tot), [...new Set(wr)], `${T(h * 60 + m)} + ${dur} min = ${T(h * 60 + m + dur)}; + ${brk} min = ${T(tot)}`); },
  (g) => { const k = g.int(3, 6), son = g.int(5, 12), S = son * (k + 1); return numQ(g, `Ota o‘g‘lidan ${k} marta katta. Ularning yoshlari yig‘indisi ${S} ga teng. O‘g‘il necha yoshda?`, son, `O‘g‘il yoshi 1 qism, ota ${k} qism, jami ${k + 1} qism. ${S} : ${k + 1} = ${son}`, "yosh"); },
  (g) => { const c = g.pick([30, 40, 45, 50]); let n; do { n = g.int(c * 2 + 1, c * 5 - 1); } while (n % c === 0); const ans = Math.ceil(n / c);
    return numQ(g, `Bitta avtobusga ${c} kishi sig‘adi. ${n} nafar o‘quvchini tashish uchun kamida nechta avtobus kerak?`, ans, `${n} : ${c} = ${Math.floor(n / c)} (qoldiq ${n % c}). Qolganlar uchun yana 1 ta avtobus: ${ans}`, "ta"); },
  (g) => { const small = g.int(10, 200), D = g.int(5, 80), S = 2 * small + D; return numQ(g, `Ikki sonning yig‘indisi ${S} ga teng, biri ikkinchisidan ${D} ta katta. Kichik sonni toping.`, small, `(${S} − ${D}) : 2 = ${small}`); },
  (g) => { const d = g.int(0, 6), n = g.int(8, 60); const ans = DAYS[(d + n) % 7];
    return txtQ(g, `Bugun ${DAYS[d]}. ${n} kundan keyin haftaning qaysi kuni bo‘ladi?`, cap(ans), g.sample(DAYS.filter((x) => x !== ans), 3).map(cap), `Har 7 kunda kun takrorlanadi. ${n} = 7 × ${Math.floor(n / 7)} + ${n % 7}, ya’ni ${DAYS[d]}dan ${n % 7} kun keyin — ${ans}`); },
];

/* ---------------- MATEMATIKA: murakkab ---------------- */
const HARD = [
  (g) => { const r = g.int(2, 12), c = g.int(3, 15), H = r + c, L = 2 * c + 4 * r; return numQ(g, `Hovlida tovuqlar va quyonlar bor. Ularning boshlari jami ${H} ta, oyoqlari esa ${L} ta. Hovlida nechta quyon bor?`, r, `Hammasi tovuq bo‘lganda ${2 * H} ta oyoq bo‘lardi. Ortiqcha: ${L} − ${2 * H} = ${L - 2 * H}. Har bir quyonda 2 ta ortiqcha oyoq: ${L - 2 * H} : 2 = ${r}`, "ta"); },
  (g) => { const k = g.int(5, 15); let cnt = 0; for (let n = 10; n <= 99; n++) if (Math.floor(n / 10) + (n % 10) === k) cnt++;
    return numQ(g, `Raqamlari yig‘indisi ${k} ga teng bo‘lgan nechta ikki xonali son bor?`, cnt, `O‘nlar raqamini 1 dan 9 gacha tekshirib, birlar raqami 0–9 oralig‘ida bo‘lganlarini sanaymiz: ${cnt} ta`, "ta"); },
  (g) => { const P = g.int(30, 250); let D = 0; for (let i = 1; i <= P; i++) D += String(i).length;
    return numQ(g, `Kitob sahifalarini 1 dan boshlab raqamlash uchun jami ${D} ta raqam ishlatildi. Kitob necha sahifadan iborat?`, P, `1–9: 9 ta raqam; 10–99: 180 ta raqam` + (P >= 100 ? `; qolgan ${D - 189} ta raqam 3 xonali sahifalarga: ${(D - 189) / 3} sahifa. 99 + ${(D - 189) / 3} = ${P}` : `; qolgan ${D - 9} ta raqam ikki xonali sahifalarga: ${(D - 9) / 2} sahifa. 9 + ${(D - 9) / 2} = ${P}`), "sahifa"); },
  (g) => { const n = g.int(5, 12); return numQ(g, `${n} nafar do‘st uchrashganda har biri qolganlarning har biri bilan bir martadan qo‘l berib ko‘rishdi. Jami nechta qo‘l berib ko‘rishish bo‘ldi?`, (n * (n - 1)) / 2, `Har biri ${n - 1} kishi bilan ko‘rishadi: ${n} × ${n - 1} = ${n * (n - 1)}. Har bir ko‘rishish ikki marta sanaldi: ${n * (n - 1)} : 2 = ${(n * (n - 1)) / 2}`, "ta"); },
  (g) => { const n = g.int(6, 20), d = g.int(2, 9); return numQ(g, `Yo‘l bo‘yida bir qatorda ${n} ta daraxt o‘sadi. Har ikki qo‘shni daraxt orasidagi masofa ${d} m. Birinchi va oxirgi daraxt orasidagi masofani toping.`, (n - 1) * d, `${n} ta daraxt orasida ${n - 1} ta oraliq bor: ${n - 1} × ${d} = ${(n - 1) * d} m`, "m"); },
  (g) => { const per = g.int(12, 24), f = g.int(4, 9); return numQ(g, `Binoning 1-qavatidan 3-qavatiga chiqish uchun ${2 * per} ta zinapoya pog‘onasidan o‘tiladi. 1-qavatdan ${f}-qavatga chiqish uchun nechta pog‘onadan o‘tish kerak?`, (f - 1) * per, `1-qavatdan 3-qavatga 2 ta oraliq: har birida ${per} pog‘ona. 1-qavatdan ${f}-qavatga ${f - 1} ta oraliq: ${f - 1} × ${per} = ${(f - 1) * per}`, "ta"); },
  (g) => { const set = g.pick([[2, 3], [2, 5], [3, 4], [3, 5], [2, 3, 4], [2, 3, 5], [3, 4, 5], [2, 3, 4, 5]]); const l = set.reduce((a, b) => (a * b) / gcd(a, b), 1);
    return numQ(g, `${set.join(", ").replace(/, (\d)$/, " va $1")} ga bo‘lganda har safar 1 qoldiq qoladigan 1 dan katta eng kichik natural sonni toping.`, l + 1, `Bu sonlarning eng kichik umumiy karralisi ${l}. Unga 1 qo‘shamiz: ${l + 1}`); },
  (g, g3) => { const d = g.pick([3, 4, 5, 6, 7, 9]);
    if (g3) { const c = Math.floor(99 / d) - Math.floor(9 / d); return numQ(g, `Nechta ikki xonali son ${d} ga qoldiqsiz bo‘linadi?`, c, `1–99 oralig‘ida ${Math.floor(99 / d)} ta, 1–9 oralig‘ida ${Math.floor(9 / d)} ta: ${Math.floor(99 / d)} − ${Math.floor(9 / d)} = ${c}`, "ta"); }
    const c = Math.floor(999 / d) - Math.floor(99 / d); return numQ(g, `Nechta uch xonali son ${d} ga qoldiqsiz bo‘linadi?`, c, `1–999 oralig‘ida ${Math.floor(999 / d)} ta, 1–99 oralig‘ida ${Math.floor(99 / d)} ta: ${Math.floor(999 / d)} − ${Math.floor(99 / d)} = ${c}`, "ta"); },
  (g) => { let w1, d1, w2; do { w1 = g.pick([2, 3, 4, 6]); d1 = g.int(4, 15); const tot = w1 * d1; const divs = []; for (let k = 2; k <= 12; k++) if (tot % k === 0 && k !== w1) divs.push(k); w2 = divs.length ? g.pick(divs) : 0; } while (!w2);
    return numQ(g, `${w1} nafar usta bir ishni ${d1} kunda bajaradi. Xuddi shunday ishlaydigan ${w2} nafar usta shu ishni necha kunda bajaradi?`, (w1 * d1) / w2, `Ish hajmi: ${w1} × ${d1} = ${w1 * d1} “usta-kun”. ${w1 * d1} : ${w2} = ${(w1 * d1) / w2} kun`, "kun"); },
  (g) => { const s = g.int(3, 25); return numQ(g, `Kvadratning perimetri ${4 * s} sm. Uning yuzi necha kvadrat santimetr?`, s * s, `Tomoni: ${4 * s} : 4 = ${s} sm. Yuzi: ${s} × ${s} = ${s * s} kv sm`, "kv sm"); },
  (g) => { const n = g.int(4, 12), t = g.int(2, 6); return numQ(g, `Uzun yog‘ochni ${n} bo‘lakka bo‘lish kerak. Har bir arralash ${t} minut davom etadi. Hammasi uchun necha minut kerak?`, (n - 1) * t, `${n} bo‘lak uchun ${n - 1} marta arralanadi: ${n - 1} × ${t} = ${(n - 1) * t} minut`, "minut"); },
];

/* ---------------- MANTIQIY FIKRLASH ---------------- */
const NAMES = ["Ali", "Vali", "Soli", "Lola", "Zuhra", "Anvar", "Malika", "Bobur", "Kamola", "Jasur"];
const LOGIC = [
  (g) => { const k = g.int(0, 4); let s = [], a, rule;
    if (k === 0) { const st = g.int(1, 9), d = g.int(3, 12); for (let i = 0; i < 6; i++) s.push(st + i * d); rule = `har safar ${d} qo‘shiladi`; }
    else if (k === 1) { const o = g.int(1, 4); for (let i = o; i < o + 6; i++) s.push(i * (i + 1)); rule = `n × (n + 1) ko‘rinishidagi sonlar (ayirmalar 2 tadan ortadi)`; }
    else if (k === 2) { let v = g.int(1, 5); for (let i = 0; i < 6; i++) { s.push(v); v = v * 2 + 1; } rule = `har bir son 2 ga ko‘paytirilib 1 qo‘shiladi`; }
    else if (k === 3) { let x = g.int(1, 3), y = g.int(2, 5); for (let i = 0; i < 6; i++) { s.push(x); [x, y] = [y, x + y]; } rule = `har bir son oldingi ikkitasining yig‘indisi`; }
    else { const o = g.int(1, 4); for (let i = o; i < o + 6; i++) s.push(i * i); rule = `ketma-ket sonlarning kvadratlari`; }
    a = s.pop(); return numQ(g, `Qonuniyatni toping va keyingi sonni aniqlang: ${s.join(", ")}, ?`, a, `Qonuniyat: ${rule}. Keyingi son: ${a}`); },
  (g) => { const k = g.int(3, 9); const three = g.sample([...Array(30)].map((_, i) => (i + 2) * k).filter((x) => x < 100), 3); let odd; do { odd = g.int(10, 99); } while (odd % k === 0);
    const opts = g.shuffle([...three, odd]); return { text: "Qaysi son ortiqcha?", options: opts.map(String), correct: opts.indexOf(odd), explanation: `Qolgan sonlarning hammasi ${k} ga bo‘linadi, ${odd} esa bo‘linmaydi.` }; },
  (g) => { const order = g.sample(NAMES, 4); const st = [0, 1, 2].map((i) => `${order[i]} ${order[i + 1]}dan baland.`); const qk = g.int(0, 2);
    const q = ["Eng baland kim?", "Eng past kim?", "Bo‘yi bo‘yicha balanddan ikkinchi o‘rinda kim turadi?"][qk]; const ans = [order[0], order[3], order[1]][qk];
    return txtQ(g, `${g.shuffle(st).join(" ")} ${q}`, ans, order.filter((x) => x !== ans), `Balanddan pastga: ${order.join(" > ")}`); },
  (g) => { let a, m, n; do { a = g.int(5, 30) * 10; m = g.int(2, 4); n = g.int(m + 1, 5); } while ((n * a) % m !== 0); const p = (n * a) / m;
    return numQ(g, `${n} ta olma ${m} ta nok bilan bir xil og‘irlikda. Bitta nok ${p} g bo‘lsa, bitta olma necha gramm?`, a, `${m} ta nok: ${m} × ${p} = ${m * p} g. Bu ${n} ta olmaga teng: ${m * p} : ${n} = ${a} g`, "g"); },
  (g) => { const k = g.int(0, 1); const rows = [0, 1, 2].map(() => [g.int(2, 12), g.int(2, 12)]); const f = k ? (x, y) => x * 2 + y : (x, y) => x + y + 1;
    const txt = rows.slice(0, 2).map(([x, y]) => `(${x}; ${y}) → ${f(x, y)}`).join(",   "); const [x, y] = rows[2];
    return numQ(g, `Qonuniyatni toping: ${txt},   (${x}; ${y}) → ?`, f(x, y), k ? `Qoida: birinchi son 2 ga ko‘paytirilib, ikkinchisi qo‘shiladi: ${x} × 2 + ${y} = ${f(x, y)}` : `Qoida: ikki son yig‘indisiga 1 qo‘shiladi: ${x} + ${y} + 1 = ${f(x, y)}`); },
  (g) => { const a = g.int(3, 15), b = g.int(2, 15); return numQ(g, `🍎 + 🍎 = ${2 * a},   🍎 + 🍌 = ${a + b}.   🍌 nechaga teng?`, b, `🍎 = ${2 * a} : 2 = ${a}; 🍌 = ${a + b} − ${a} = ${b}`); },
  (g) => { const h = g.pick([1, 2, 3, 4, 5, 6]); return numQ(g, `Soat aniq ${h}:00 ni ko‘rsatmoqda. Soat va minut millari orasidagi (kichik) burchak necha gradus?`, h * 30, `Siferblat 12 bo‘lakka bo‘lingan, har biri 360° : 12 = 30°. ${h} × 30° = ${h * 30}°`, "°"); },
];

/* ---------------- INGLIZ TILI (A1) ---------------- */
const EN = [
  ["I ___ a student.", ["am", "is", "are", "be"], 0], ["They ___ my friends.", ["is", "am", "are", "be"], 2], ["She ___ a cat.", ["have", "has", "is", "are"], 1],
  ["We ___ breakfast at 8 o’clock.", ["has", "have", "is", "are"], 1], ["There ___ two books on the table.", ["is", "am", "are", "be"], 2], ["There ___ a pen in my bag.", ["are", "is", "am", "were"], 1],
  ["The plural of “child” is ___.", ["childs", "childes", "children", "childrens"], 2], ["The plural of “box” is ___.", ["boxs", "boxes", "boxies", "box"], 1], ["The plural of “mouse” is ___.", ["mouses", "mice", "mices", "mousees"], 1],
  ["My birthday is ___ May.", ["in", "on", "at", "of"], 0], ["The lesson starts ___ 9 o’clock.", ["in", "on", "at", "to"], 2], ["I go to school ___ Monday.", ["in", "on", "at", "of"], 1],
  ["The opposite of “big” is ___.", ["tall", "long", "small", "fat"], 2], ["The opposite of “hot” is ___.", ["warm", "cold", "wet", "dry"], 1], ["The opposite of “happy” is ___.", ["sad", "funny", "kind", "good"], 0],
  ["He ___ football every day.", ["play", "plays", "playing", "is play"], 1], ["My mother ___ in a hospital. She is a doctor.", ["work", "works", "working", "is work"], 1],
  ["___ you like ice cream? — Yes, I do.", ["Do", "Does", "Are", "Is"], 0], ["___ he speak English? — Yes, he does.", ["Do", "Does", "Is", "Are"], 1], ["I can ___ fast.", ["runs", "running", "to run", "run"], 3],
  ["Yesterday I ___ at home.", ["am", "was", "were", "is"], 1], ["They ___ in the park yesterday.", ["was", "is", "were", "are"], 2], ["Look! The children ___ now.", ["play", "plays", "are playing", "played"], 2],
  ["Tomorrow we ___ to the zoo.", ["go", "went", "will go", "goes"], 2], ["These ___ my pencils.", ["is", "are", "am", "be"], 1], ["Choose the correct spelling.", ["beatiful", "beautifull", "beautiful", "beutiful"], 2],
  ["What colour is the sky on a sunny day?", ["green", "blue", "red", "black"], 1], ["A cow gives us ___.", ["milk", "eggs", "honey", "bread"], 0], ["We use a ___ to write.", ["spoon", "pen", "cup", "ball"], 1],
  ["How many days are there in a week?", ["five", "six", "seven", "eight"], 2], ["Which month comes after March?", ["May", "February", "April", "June"], 2], ["Which day comes after Friday?", ["Thursday", "Sunday", "Saturday", "Monday"], 2],
  ["What is “olma” in English?", ["orange", "apple", "pear", "plum"], 1], ["What is “kitob” in English?", ["book", "bag", "pen", "desk"], 0], ["What is “deraza” in English?", ["door", "wall", "window", "floor"], 2],
  ["What is “oshxona” in English?", ["bedroom", "kitchen", "garden", "bathroom"], 1], ["Your father’s mother is your ___.", ["aunt", "sister", "grandmother", "cousin"], 2], ["Your mother’s brother is your ___.", ["uncle", "grandfather", "cousin", "son"], 0],
  ["This is ___ apple.", ["a", "an", "the two", "some a"], 1], ["I have ___ dog.", ["an", "a", "many", "two a"], 1], ["___ is your name? — My name is Ali.", ["Who", "What", "Where", "How"], 1],
  ["___ old are you? — I am ten.", ["What", "How", "Where", "When"], 1], ["___ do you live? — I live in Bukhara.", ["Where", "What", "Who", "How"], 0], ["Ali is taller ___ Vali.", ["then", "that", "than", "as"], 2],
  ["An elephant is ___ than a mouse.", ["big", "bigger", "biggest", "more big"], 1], ["Which word is an animal?", ["table", "tiger", "teacher", "tomato"], 1], ["Which word is a fruit?", ["carrot", "potato", "banana", "onion"], 2],
  ["Read: “Tom is nine. He has a sister. Her name is Anna. She is seven.” How old is Anna?", ["nine", "seven", "eight", "six"], 1],
  ["Read: “Tom is nine. He has a sister. Her name is Anna. She is seven.” Who is Tom’s sister?", ["Anna", "Tom", "Sara", "Mary"], 0],
  ["Read: “Sara gets up at seven. She goes to school by bus.” How does Sara go to school?", ["on foot", "by car", "by bus", "by bike"], 2],
];
function enQs(g, n) {
  return g.sample(EN, n).map(([q, opts, a]) => { const o = g.shuffle(opts.map((t, i) => ({ t, ok: i === a }))); return { subject: "Ingliz tili", text: q, options: o.map((x) => x.t), correct: o.findIndex((x) => x.ok), explanation: `To‘g‘ri javob: ${opts[a]}` }; });
}

/* ---------------- VARIANTLAR YIG‘ISH ---------------- */
function fromPool(g, pool, n, g3, subject, used) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 2000) {
    const q = g.pick(pool)(g, g3);
    if (used.has(q.text)) continue;
    used.add(q.text); out.push({ subject, ...q });
  }
  return out;
}
const VARIANTS = 3;
const BUILD = {
  pm1: { dur: 60, make: (g) => { const u = new Set(); return [...fromPool(g, EASY, 10, false, "Matematika", u), ...fromPool(g, MEDIUM, 10, false, "Matematika", u), ...fromPool(g, HARD, 10, false, "Matematika", u)]; } },
  pm2: { dur: 120, make: (g) => { const u = new Set(); return [...fromPool(g, MEDIUM, 14, false, "Matematika", u), ...fromPool(g, HARD, 14, false, "Matematika", u), ...fromPool(g, LOGIC, 12, false, "Matematika", u), ...enQs(g, 40)]; } },
  ixt: { dur: 105, make: (g) => { const u = new Set(); return [...fromPool(g, EASY, 7, false, "Matematika", u), ...fromPool(g, MEDIUM, 7, false, "Matematika", u), ...fromPool(g, HARD, 6, false, "Matematika", u), ...fromPool(g, LOGIC, 10, false, "Mantiqiy fikrlash", u), ...enQs(g, 15)]; } },
  ol3: { dur: 45, grade: 3, make: (g) => { const u = new Set(); return [...fromPool(g, MEDIUM, 7, true, "Matematika", u), ...fromPool(g, HARD, 7, true, "Matematika", u), ...fromPool(g, LOGIC, 6, true, "Mantiqiy fikrlash", u)]; } },
  ol4: { dur: 45, make: (g) => { const u = new Set(); return [...fromPool(g, MEDIUM, 4, false, "Matematika", u), ...fromPool(g, HARD, 10, false, "Matematika", u), ...fromPool(g, LOGIC, 6, false, "Mantiqiy fikrlash", u)]; } },
};

// Har bir test o‘z savollari bilan bitta tranzaksiyada (batch) yoziladi — Turso’da tez va xavfsiz.
async function seed(db) {
  const t0 = Math.floor(Date.now() / 1000);
  for (const [sec, b] of Object.entries(BUILD)) {
    for (let v = 1; v <= VARIANTS; v++) {
      const g = new G(sec.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + v * 1000);
      const qs = b.make(g);
      await db.batch([
        ["INSERT INTO tests(section,title,grade,duration_min,published,sort,created_at) VALUES(?,?,?,?,1,?,?)", sec, `${v}-variant`, b.grade || 4, b.dur, v, t0],
        ...qs.map((q, i) => ["INSERT INTO questions(test_id,ord,subject,text,image,options,correct,explanation) VALUES((SELECT MAX(id) FROM tests),?,?,?,'',?,?,?)", i + 1, q.subject, q.text, JSON.stringify(q.options), q.correct, q.explanation || ""]),
      ]);
    }
  }
}
module.exports = { seed, BUILD, G, EASY, MEDIUM, HARD, LOGIC, EN };
