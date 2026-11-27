// Turso (libSQL) bilan ishlash uchun kichik yordamchi.
// db.get / db.all / db.run — so‘rovlar; db.tx(async (q) => ...) — tranzaksiya (q ichida ham get/all/run bor).
"use strict";
const { createClient } = require("@libsql/client");

const arg = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const plain = (rs) => rs.rows.map((r) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = r[i]; }); return o; });

function wrap(x) {
  const ex = (sql, args) => x.execute({ sql, args: args.map(arg) });
  return {
    get: async (sql, ...a) => plain(await ex(sql, a))[0],
    all: async (sql, ...a) => plain(await ex(sql, a)),
    run: async (sql, ...a) => { const r = await ex(sql, a); return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) }; },
  };
}

function open({ url, authToken }) {
  const client = createClient({ url, authToken: authToken || undefined });
  const db = wrap(client);
  db.client = client;
  db.exec = (sql) => client.executeMultiple(sql);
  // Bir nechta yozuvni bitta tranzaksiyada (hammasi yoki hech biri) bajarish: [[sql, ...args], ...]
  db.batch = (stmts) => client.batch(stmts.map(([sql, ...a]) => ({ sql, args: a.map(arg) })), "write");
  db.tx = async (fn) => {
    const t = await client.transaction("write");
    try { const r = await fn(wrap(t)); await t.commit(); return r; }
    catch (e) { try { await t.rollback(); } catch {} throw e; }
    finally { t.close(); }
  };
  return db;
}

module.exports = { open };
