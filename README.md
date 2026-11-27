# Little Star — backend (API)

Navoiy-Qorako‘l o‘quv markazining **Little Star** ta’limiy platformasi uchun server qismi.
Frontend (sayt) alohida repoda: [`littlestar`](https://github.com/zufarbekjumayev2611/littlestar).

```
 Sayt (littlestar.uz)  ──HTTPS──►  API (api.littlestar.uz, shu repo)  ──►  Turso (ma’lumotlar bazasi)
                                          │
                                          └──►  data/uploads/  (video, rasm, PDF fayllar)
```

- **Node.js 20.12+**, bitta tashqi kutubxona: [`@libsql/client`](https://www.npmjs.com/package/@libsql/client) (Turso).
- Barcha jadvallar server birinchi ishga tushganda **o‘zi yaratiladi** (`src/schema.js`). Shu paytda namunaviy testlar va “Al-Xorazmiy olimpiadasi (7–8-sinflar)” kursi ham qo‘shiladi.

## Tuzilma
| Fayl | Vazifasi |
|---|---|
| `src/server.js` | HTTP server, kirish/ro‘yxatdan o‘tish, bolalar profillari, testlar, reyting, admin API, CORS |
| `src/academy.js` | Olimpiadaga tayyorlov: kurslar, darslar, jonli dars, video yechimlar, uyga vazifa va tekshirish, jurnal, fayl yuklash, **Payme/Click to‘lovlari** |
| `src/schema.js` | Ma’lumotlar bazasi jadvallari |
| `src/db.js` | Turso bilan ishlash (so‘rovlar va tranzaksiyalar) |
| `src/seed.js` | Namunaviy test variantlari |
| `deploy/` | systemd xizmati, Nginx sozlamasi, fayllar zaxirasi skripti |
| `.env.example` | Barcha sozlamalar ro‘yxati (namuna) |

## 1. Turso bazasini tayyorlash
1. [turso.tech](https://turso.tech) da baza yarating (masalan `littlestar`). Hudud sifatida Yevropa (masalan Frankfurt) tanlang, u O‘zbekistonga yaqinroq.
2. Manzil va tokenni oling. Ularni panelning “Connect” bo‘limidan yoki CLI orqali olish mumkin:
   ```bash
   turso db show littlestar --url        # libsql://littlestar-....turso.io
   turso db tokens create littlestar     # uzun token
   ```
3. Bu ikkalasini `.env` faylidagi `TURSO_DATABASE_URL` va `TURSO_AUTH_TOKEN` qatorlariga yozasiz. Jadvallarni qo‘lda yaratish **shart emas**.

## 2. Lokal ishga tushirish
```bash
npm install
cp .env.example .env        # keyin .env ni to‘ldiring
npm start                   # http://localhost:3000
npm run create-admin -- 998901234567 KuchliParol   # birinchi admin
```
`TURSO_DATABASE_URL` bo‘sh qoldirilsa, server lokal `data/littlestar.db` fayli bilan ishlaydi. Bu faqat sinash uchun.

## 3. Sozlamalar (`.env`)
| O‘zgaruvchi | Nima uchun |
|---|---|
| `PORT` | Server porti (standart 3000) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Turso bazasi |
| `PUBLIC_URL` | API’ning internetdagi manzili, masalan `https://api.littlestar.uz`. Yuklangan fayl havolalari shu bilan boshlanadi |
| `SITE_URL` | Sayt manzili, masalan `https://littlestar.uz`. To‘lovdan keyin o‘quvchi shu manzilga qaytadi |
| `CORS_ORIGINS` | API’ga murojaat qilishiga ruxsat berilgan saytlar, vergul bilan ajratiladi: `https://littlestar.uz,https://www.littlestar.uz` |
| `UPLOAD_DIR` | Yuklangan fayllar papkasi (standart `data/uploads`) |
| `PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_TEST` | Payme. Sinovda `PAYME_TEST=1`, haqiqiy to‘lovda `0` |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` | Click |

> ⚠️ `.env` fayli `.gitignore` da turibdi va GitHub’ga **chiqmaydi**. Kalitlarni hech qachon kodga, GitHub’ga yoki chatga yozmang.

## 4a. Render’ga joylash (tavsiya)
| Render maydoni | Qiymat |
|---|---|
| Runtime / Language | **Node** |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

**Environment** bo‘limiga `.env.example` dagi o‘zgaruvchilarni kiriting: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PUBLIC_URL`, `SITE_URL`, `CORS_ORIGINS`, kerak bo‘lsa `PAYME_*` va `CLICK_*`. Bundan tashqari `NODE_VERSION=22` qo‘shing. `PORT`ni **yozmang**, uni Render o‘zi beradi. Serverda `.env` fayli kerak emas.

**Yuklangan fayllar uchun disk:** Render’da server qayta ishga tushganda oddiy fayl tizimi tozalanadi. O‘qituvchi yuklagan video va o‘quvchilar topshirgan rasmlar yo‘qolmasligi uchun **Disk** qo‘shing (pullik rejada mavjud): Mount Path `/var/data`, so‘ng `UPLOAD_DIR=/var/data/uploads`. Baza Turso’da bo‘lgani uchun unga ta’sir qilmaydi.

**Birinchi admin:** kompyuteringizda shu repoda `.env` ga Turso manzil va tokenini yozib, `npm install` va `npm run create-admin -- 998XXXXXXXXX KuchliParol` buyruqlarini bering. Baza umumiy (Turso), shuning uchun admin Render’dagi saytda ham ishlaydi. Render’ning Shell bo‘limi orqali ham shu buyruqni berish mumkin.

`render.yaml` fayli bor, shuning uchun “New → Blueprint” orqali ulasangiz, bu sozlamalar avtomatik olinadi.

## 4b. Serverga (VPS) o‘rnatish
Fayllar diskka yoziladi, shuning uchun API doimiy diskli serverda ishlashi kerak (VPS, Railway volume, Render disk va h.k.). Ubuntu VPS misolida:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs nginx
sudo useradd -r -s /usr/sbin/nologin littlestar
sudo git clone https://github.com/zufarbekjumayev2611/littlestar_backend /opt/littlestar-backend
cd /opt/littlestar-backend && sudo npm ci --omit=dev
sudo cp .env.example .env && sudo nano .env && sudo chmod 600 .env
sudo chown -R littlestar /opt/littlestar-backend
sudo -u littlestar npm run create-admin -- 998XXXXXXXXX KuchliParol
sudo cp deploy/littlestar-api.service /etc/systemd/system/ && sudo systemctl enable --now littlestar-api
sudo cp deploy/nginx-api.conf /etc/nginx/sites-available/littlestar-api
sudo ln -s /etc/nginx/sites-available/littlestar-api /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.littlestar.uz
```
DNS: `api.littlestar.uz` uchun A-yozuvni VPS IP manziliga yo‘naltiring. Tekshirish uchun `https://api.littlestar.uz/api/health` manzili `{"ok":true}` qaytarishi kerak.

**Yangilash:** `git pull && npm ci --omit=dev && sudo systemctl restart littlestar-api`.
**Zaxira:** bazani Turso o‘zi saqlaydi. Yuklangan fayllar uchun `deploy/backup-uploads.sh` skriptini cron’ga qo‘shing.

## 5. To‘lov tizimi (Payme va Click)
O‘quvchi saytda “To‘lash” tugmasini bosadi va Payme yoki Click sahifasiga o‘tadi. To‘lov tasdiqlangach, server o‘quvchini kursga **avtomatik** qo‘shadi.
| | Payme (business.payme.uz) | Click (merchant.click.uz) |
|---|---|---|
| Kabinetdagi URL | `https://api.littlestar.uz/api/pay/payme` | Prepare: `https://api.littlestar.uz/api/pay/click/prepare`<br>Complete: `https://api.littlestar.uz/api/pay/click/complete` |
| Hisob maydoni | `order_id` | — |

Faqat kalitlari kiritilgan to‘lov usuli saytda ko‘rinadi. Payme’ni avval test muhitida (`PAYME_TEST=1`, sandbox) sinab ko‘ring.

## API (qisqacha)
Avtorizatsiya: `Authorization: Bearer <token>`. Hamma javoblar JSON formatida.
- Kirish: `POST /api/auth/register|login|logout`, `GET /api/me`, `GET /api/meta`
- Bolalar: `POST|PUT|DELETE /api/children[/:id]`
- Testlar va reyting: `GET /api/tests`, `POST /api/tests/:id/start`, `POST /api/attempts/:id/submit`, `GET /api/leaderboard`
- Olimpiada (o‘quvchi): `GET /api/academy/olympiads|courses`, `GET /api/academy/courses/:id`, `POST /api/academy/courses/:id/join|pay`, `GET /api/academy/lessons/:id`, `POST /api/academy/lessons/:id/join|submit|comments`, `GET /api/academy/orders/:id`
- O‘qituvchi: `/api/teach/olympiads`, `/api/teach/courses[/:id]`, `.../lessons`, `.../students/:child`, `.../announcements`, `.../journal`, `.../orders`, `/api/teach/submissions[/:id]`
- Admin: `/api/admin/stats|settings|tests|users`
- Fayllar: `POST /api/upload?name=` (fayl oqimi), `GET /files/:id/:key/:name`
- To‘lov tizimlari uchun: `POST /api/pay/payme`, `POST /api/pay/click/prepare|complete`
- Holat: `GET /api/health`
