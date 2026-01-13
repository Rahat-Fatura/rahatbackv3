# 🚀 Rahat Backup - Self-Hosted Deployment Guide

## 📋 Overview

Bu dokümantasyon, Rahat Backup'ı **kendi sunucunuzda** (self-hosted) deploy etmek için gerekli adımları içerir.

**Not:** Render.com veya Vercel gibi platformlara deployment için `docs/platform-specific/` klasöründeki guide'lara bakabilirsiniz.

---

## 🏗️ System Requirements

### Backend Server
- **OS:** Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **Node.js:** v16.x veya üzeri
- **PostgreSQL:** v12 veya üzeri
- **RAM:** Minimum 2GB (4GB+ önerilir)
- **Disk:** Minimum 20GB (backup storage için daha fazla gerekebilir)

### Frontend Hosting
- **Web Server:** Nginx / Apache
- **SSL Certificate:** Let's Encrypt (ücretsiz) veya commercial

---

## 📦 Installation Steps

### 1. Prerequisite Setup

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm postgresql nginx certbot

# Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (Process Manager)
sudo npm install -g pm2
```

### 2. PostgreSQL Setup

```bash
# PostgreSQL kullanıcısına geç
sudo -u postgres psql

# Database ve user oluştur
CREATE DATABASE rahat_backup_prod;
CREATE USER rahat_admin WITH ENCRYPTED PASSWORD 'your-strong-password';
GRANT ALL PRIVILEGES ON DATABASE rahat_backup_prod TO rahat_admin;
\q
```

### 3. Backend Deployment

```bash
# Projeyi clone et
git clone https://github.com/your-username/rahat-backup.git
cd rahat-backup/backend

# Dependencies kur
npm install

# .env.production dosyası oluştur
cp .env.production.example .env.production

# .env.production'ı düzenle (DATABASE_URL, JWT_SECRET, vb)
nano .env.production

# Prisma Client generate et
npx prisma generate

# Migrations çalıştır
npx prisma migrate deploy

# PM2 ile başlat
pm2 start src/index.js --name rahat-backend --env production
pm2 save
pm2 startup  # Sunucu restart'ta otomatik başlasın
```

**Important `.env.production` variables:**
```env
DATABASE_URL=postgresql://rahat_admin:password@localhost:5432/rahat_backup_prod
JWT_SECRET=<generate-with-crypto>
APP_URL=https://yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Frontend Deployment

```bash
cd ../frontend

# Dependencies kur
npm install

# .env.production dosyası oluştur
cp .env.production.example .env.production

# .env.production'ı düzenle
nano .env.production

# Production build oluştur
npm run build

# Build'i web server'a kopyala
sudo cp -r build/* /var/www/rahat-backup/
```

**`.env.production`:**
```env
REACT_APP_API_URL=https://api.yourdomain.com
```

### 5. Nginx Configuration

```bash
# Backend için (API subdomain)
sudo nano /etc/nginx/sites-available/rahat-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Frontend için
sudo nano /etc/nginx/sites-available/rahat-frontend
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/rahat-backup;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
```

```bash
# Enable sites
sudo ln -s /etc/nginx/sites-available/rahat-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/rahat-frontend /etc/nginx/sites-enabled/

# Test ve restart
sudo nginx -t
sudo systemctl restart nginx
```

### 6. SSL Certificate (Let's Encrypt)

```bash
# Frontend için SSL
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Backend için SSL
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal test
sudo certbot renew --dry-run
```

---

## 🔄 Updates & Maintenance

### Backend Update

```bash
cd rahat-backup/backend
git pull origin main
npm install
npx prisma migrate deploy
npx prisma generate
pm2 restart rahat-backend
```

### Frontend Update

```bash
cd rahat-backup/frontend
git pull origin main
npm install
npm run build
sudo cp -r build/* /var/www/rahat-backup/
```

### Database Backup

```bash
# Otomatik günlük backup (crontab)
0 2 * * * pg_dump rahat_backup_prod > /backups/rahat_$(date +\%Y\%m\%d).sql
```

### Monitoring

```bash
# PM2 logs
pm2 logs rahat-backend

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

---

## 🧪 Testing

### Backend Health Check
```bash
curl https://api.yourdomain.com/v1/auth/login
# Expected: 400 Bad Request (endpoint works)
```

### Frontend Check
1. Open: https://yourdomain.com
2. Register new account
3. Login
4. Create database connection
5. Create backup job

---

## 🚨 Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs rahat-backend

# Common issues:
# - DATABASE_URL wrong
# - Port 3000 already in use
# - Missing environment variables
```

### Database connection failed
```bash
# Test connection
psql -U rahat_admin -d rahat_backup_prod -h localhost

# Check PostgreSQL status
sudo systemctl status postgresql
```

### Nginx 502 Bad Gateway
```bash
# Backend çalışıyor mu?
pm2 status

# Port 3000 açık mı?
netstat -tlnp | grep 3000
```

---

## 📊 Architecture (Current - Phase 1)

```
┌─────────────────────┐
│  Web Browser        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Nginx (Reverse     │
│  Proxy + SSL)       │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌──────────────┐
│Frontend │ │Backend API   │
│(React)  │ │(Node.js/PM2) │
└─────────┘ └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │PostgreSQL DB │
            └──────────────┘
```

**⚠️ Phase 1 Limitation:** Şu anda sadece **public erişilebilir** database'leri destekliyoruz (AWS RDS, managed databases, etc).

**Phase 2 (Coming Soon):** Desktop Agent eklenecek → Local database'lere erişim sağlanacak.

---

## 🔮 Phase 2: Desktop Agent Architecture

```
┌─────────────────────┐
│  Web Dashboard      │
│  (Yönetim UI)       │
└──────────┬──────────┘
           │ API
           ▼
┌─────────────────────┐
│  Backend API        │
└──────────┬──────────┘
           │ WebSocket
           ▼
┌─────────────────────┐
│  Desktop Agent      │ ← Kullanıcı PC'sinde
│  (Electron App)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Local PostgreSQL   │ ← localhost:5432
│  MySQL, MSSQL, etc  │
└─────────────────────┘
```

---

## 📞 Support & Documentation

- **Backend API:** `backend/README.md`
- **Frontend:** `frontend/README.md`
- **Database Schema:** `backend/src/prisma/schema.prisma`
- **Platform-Specific Guides:** `docs/platform-specific/`
  - Render.com deployment
  - Vercel deployment
  - Docker deployment

---

## ✅ Production Checklist

- [ ] PostgreSQL kuruldu ve güvenli
- [ ] Backend `.env.production` yapılandırıldı
- [ ] Frontend `.env.production` yapılandırıldı
- [ ] PM2 ile backend çalışıyor
- [ ] Nginx reverse proxy yapılandırıldı
- [ ] SSL certificate kuruldu (Let's Encrypt)
- [ ] Firewall yapılandırıldı (80, 443 açık)
- [ ] Database backup cron job kuruldu
- [ ] Monitoring kuruldu (PM2, logs)
- [ ] Test edildi (register, login, backup)

---

## 🎉 Deployment Complete!

**Production URLs:**
- Frontend: `https://yourdomain.com`
- Backend API: `https://api.yourdomain.com`
- Database: Internal (PostgreSQL)

**Next Steps:**
1. Test all features thoroughly
2. Monitor logs for first week
3. Setup automated database backups
4. Phase 2: Desktop Agent development 🖥️
