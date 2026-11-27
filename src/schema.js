// Ma’lumotlar bazasi tuzilmasi. Server har ishga tushganda jadvallar yo‘q bo‘lsa yaratiladi.
// Eslatma: bog‘langan yozuvlarni o‘chirish (kaskad) kod ichida bajariladi — Turso’da PRAGMA foreign_keys
// har ulanishda alohida bo‘lgani uchun ON DELETE CASCADE’ga tayanmaymiz.
"use strict";
module.exports = `
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  parent_name TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'user', premium_until INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS children(
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, name TEXT NOT NULL, grade INTEGER NOT NULL,
  region TEXT NOT NULL, district TEXT DEFAULT '', school TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_children_account ON children(account_id);
CREATE TABLE IF NOT EXISTS tests(
  id INTEGER PRIMARY KEY, section TEXT NOT NULL, title TEXT NOT NULL, grade INTEGER DEFAULT 4,
  duration_min INTEGER NOT NULL DEFAULT 60, published INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY, test_id INTEGER NOT NULL, ord INTEGER NOT NULL, subject TEXT DEFAULT 'Matematika',
  text TEXT NOT NULL, image TEXT DEFAULT '', options TEXT NOT NULL, correct INTEGER NOT NULL, explanation TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id, ord);
CREATE TABLE IF NOT EXISTS attempts(
  id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL, test_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  started_at INTEGER NOT NULL, finished_at INTEGER, time_sec INTEGER, correct INTEGER, total INTEGER, answers TEXT);
CREATE INDEX IF NOT EXISTS idx_att_test ON attempts(test_id,status);
CREATE INDEX IF NOT EXISTS idx_att_child ON attempts(child_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS olympiads(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '🏆',
  published INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY, olympiad_id INTEGER, title TEXT NOT NULL, grade INTEGER DEFAULT 7, grade_to INTEGER,
  description TEXT DEFAULT '', live_url TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0,
  access_days INTEGER NOT NULL DEFAULT 30, published INTEGER NOT NULL DEFAULT 1, open_join INTEGER NOT NULL DEFAULT 0,
  sort INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments(
  course_id INTEGER NOT NULL, child_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, paid_until INTEGER NOT NULL DEFAULT -1, PRIMARY KEY(course_id, child_id));
CREATE TABLE IF NOT EXISTS lessons(
  id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, title TEXT NOT NULL, starts_at INTEGER DEFAULT 0,
  duration_min INTEGER DEFAULT 90, body TEXT DEFAULT '', live_url TEXT DEFAULT '', hw_text TEXT DEFAULT '',
  hw_due INTEGER DEFAULT 0, hw_max INTEGER DEFAULT 10, solutions_mode TEXT DEFAULT 'after_due',
  published INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, starts_at);
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, key TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  account_id INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lesson_items(
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT DEFAULT '',
  file_id INTEGER, url TEXT DEFAULT '', ord INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_items_lesson ON lesson_items(lesson_id);
CREATE TABLE IF NOT EXISTS submissions(
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL, child_id INTEGER NOT NULL, text TEXT DEFAULT '',
  files TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'submitted', score REAL, feedback TEXT DEFAULT '',
  feedback_files TEXT DEFAULT '[]', submitted_at INTEGER NOT NULL, checked_at INTEGER, UNIQUE(lesson_id, child_id));
CREATE TABLE IF NOT EXISTS lesson_comments(
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL, account_id INTEGER, child_id INTEGER,
  text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comments_lesson ON lesson_comments(lesson_id);
CREATE TABLE IF NOT EXISTS attendance(
  lesson_id INTEGER NOT NULL, child_id INTEGER NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY(lesson_id, child_id));
CREATE TABLE IF NOT EXISTS announcements(
  id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, child_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
  amount INTEGER NOT NULL, days INTEGER NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL, paid_at INTEGER);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, ext_id TEXT NOT NULL, order_id INTEGER NOT NULL,
  amount INTEGER NOT NULL, state INTEGER NOT NULL, create_time INTEGER NOT NULL, perform_time INTEGER DEFAULT 0,
  cancel_time INTEGER DEFAULT 0, reason INTEGER, ptime INTEGER DEFAULT 0, UNIQUE(provider, ext_id));
`;
