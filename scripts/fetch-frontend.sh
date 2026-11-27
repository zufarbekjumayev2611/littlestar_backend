#!/bin/sh
# Saytni (frontend) build paytida GitHub'dan olib keladi: backend uni o'zi ko'rsatadi.
# Render'da Build Command: npm run build
set -e
REPO="${FRONTEND_REPO:-https://github.com/zufarbekjumayev2611/littlestar.git}"
BRANCH="${FRONTEND_BRANCH:-main}"
rm -rf frontend
git clone --depth 1 --branch "$BRANCH" "$REPO" frontend
rm -rf frontend/.git
if [ ! -f frontend/public/index.html ]; then echo "XATO: $REPO ($BRANCH) ichida public/index.html topilmadi"; exit 1; fi
echo "Sayt olindi: $REPO ($BRANCH)"
