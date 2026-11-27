#!/bin/sh
# Yuklangan fayllar (videolar, vazifa rasmlari) zaxirasi. Baza Turso’da — uning zaxirasini Turso o‘zi saqlaydi.
# crontab -e  →  15 3 * * * /opt/littlestar-backend/deploy/backup-uploads.sh
mkdir -p /opt/littlestar-backups/uploads
cp -rn /opt/littlestar-backend/data/uploads/. /opt/littlestar-backups/uploads/ 2>/dev/null || true
