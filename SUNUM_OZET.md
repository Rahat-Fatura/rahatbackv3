# RAHATBACK v3 - BASIT ANLATIM

## GENEL MIMARI (Program Nasil Calisiyor?)

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │  HTTP   │                 │  WS     │                 │
│    FRONTEND     │ ───────>│    BACKEND      │<───────>│  DESKTOP AGENT  │
│    (React)      │         │   (Node.js)     │         │   (Electron)    │
│                 │<─────── │                 │         │                 │
│  Kullanicinin   │  JSON   │  API + DB +     │ Socket  │  Kullanicinin   │
│  tarayicisinda  │         │  Zamanlayici    │   IO    │  bilgisayarinda │
│  calisiyor      │         │  sunucuda       │         │  calisiyor      │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                    │
                                    │ Prisma ORM
                                    ▼
                            ┌─────────────────┐
                            │   PostgreSQL    │
                            │   (Ana DB)      │
                            └─────────────────┘
```

### Neden 3 Katman Var?

| Katman | Nerede Calisiyor | Neden Gerekli |
|--------|------------------|---------------|
| **Frontend** | Tarayici | Kullanici arayuzu |
| **Backend** | Sunucu | API, veritabani, zamanlama |
| **Agent** | Kullanici PC | Localhost DB'ye erisim, backup alma |

**KRITIK:** Backend sunucuda, kullanicinin localhost'undaki veritabanina erişemez. Bu yuzden Agent gerekli!

---

## 1. DATABASE EKLEME - ILETISIM AKISI

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ KULLANICI│      │ FRONTEND │      │ BACKEND  │      │  AGENT   │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ 1. Form doldur  │                 │                 │
     │ "Test Et" tikla │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │                 │ 2. HTTP POST    │                 │
     │                 │ /test-connection│                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │                 │ 3. WebSocket    │
     │                 │                 │ "database:test" │
     │                 │                 │────────────────>│
     │                 │                 │                 │
     │                 │                 │                 │ 4. Agent DB'ye
     │                 │                 │                 │    baglanir
     │                 │                 │                 │    (localhost)
     │                 │                 │                 │
     │                 │                 │ 5. WebSocket    │
     │                 │                 │ "test:result"   │
     │                 │                 │<────────────────│
     │                 │                 │                 │
     │                 │ 6. HTTP Response│                 │
     │                 │ {success: true} │                 │
     │                 │<────────────────│                 │
     │                 │                 │                 │
     │ 7. "Baglanti    │                 │                 │
     │    Basarili!"   │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
```

### Ozet:
1. **Kullanici** form doldurur, "Test Et" tiklar
2. **Frontend** → Backend'e HTTP POST gonderir
3. **Backend** → Agent'a WebSocket ile test emri gonderir
4. **Agent** → localhost DB'ye baglanir (pg, mysql, mongo vs.)
5. **Agent** → Backend'e sonucu WebSocket ile bildirir
6. **Backend** → Frontend'e HTTP response doner
7. **Frontend** → Kullaniciya sonucu gosterir

### Neden Agent Uzerinden?
```
Backend (Sunucu)  ──X──>  localhost:5432  (ERISILEMEZ!)
                          (Kullanicinin PC'si)

Agent (Kullanici PC)  ────>  localhost:5432  (ERISILEBILIR!)
```

---

## 2. BACKUP BASLATMA - ILETISIM AKISI

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ KULLANICI│      │ FRONTEND │      │ BACKEND  │      │  AGENT   │      │  CLOUD   │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │                 │
     │ 1. "Backup      │                 │                 │                 │
     │    Baslat" tikla│                 │                 │                 │
     │────────────────>│                 │                 │                 │
     │                 │                 │                 │                 │
     │                 │ 2. HTTP POST    │                 │                 │
     │                 │ /jobs/:id/run   │                 │                 │
     │                 │────────────────>│                 │                 │
     │                 │                 │                 │                 │
     │                 │                 │ 3. History      │                 │
     │                 │                 │    kaydı olustur│                 │
     │                 │                 │    (status:     │                 │
     │                 │                 │     running)    │                 │
     │                 │                 │                 │                 │
     │                 │                 │ 4. WebSocket    │                 │
     │                 │                 │ "job:execute"   │                 │
     │                 │                 │ + DB sifresi    │                 │
     │                 │                 │ + S3 anahtarlari│                 │
     │                 │                 │────────────────>│                 │
     │                 │                 │                 │                 │
     │                 │ 5. HTTP 200     │                 │                 │
     │                 │ "Agent'a        │                 │                 │
     │                 │  gonderildi"    │                 │                 │
     │                 │<────────────────│                 │                 │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 6. pg_dump      │
     │                 │                 │                 │    localhost'tan│
     │                 │                 │                 │                 │
     │                 │                 │                 │ 7. GZIP ile     │
     │                 │                 │                 │    sikistir     │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 8. AES-256 ile  │
     │                 │                 │                 │    sifrele      │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 9. S3'e         │
     │                 │                 │                 │    yukle        │
     │                 │                 │                 │────────────────>│
     │                 │                 │                 │                 │
     │                 │                 │                 │<────────────────│
     │                 │                 │                 │   Upload OK     │
     │                 │                 │                 │                 │
     │                 │                 │ 10. WebSocket   │                 │
     │                 │                 │ "backup:        │                 │
     │                 │                 │  completed"     │                 │
     │                 │                 │<────────────────│                 │
     │                 │                 │                 │                 │
     │                 │                 │ 11. History     │                 │
     │                 │                 │     guncelle    │                 │
     │                 │                 │    (status:     │                 │
     │                 │                 │     success)    │                 │
     │                 │                 │                 │                 │
     │                 │ 12. WebSocket   │                 │                 │
     │                 │ "backup:        │                 │                 │
     │                 │  completed"     │                 │                 │
     │                 │<────────────────│                 │                 │
     │                 │                 │                 │                 │
     │ 13. UI guncelle │                 │                 │                 │
     │ "Backup         │                 │                 │                 │
     │  Tamamlandi!"   │                 │                 │                 │
     │<────────────────│                 │                 │                 │
```

### Ozet:
1. **Kullanici** "Backup Baslat" tiklar
2. **Frontend** → Backend'e HTTP POST
3. **Backend** → History kaydı olusturur (status: running)
4. **Backend** → Agent'a WebSocket ile job gonderir (DB sifresi + S3 key dahil)
5. **Backend** → Frontend'e hemen "Gonderildi" cevabi doner
6. **Agent** → pg_dump ile backup alir
7. **Agent** → GZIP ile sikistirir
8. **Agent** → AES-256 ile sifreler (istege bagli)
9. **Agent** → S3'e yukler
10. **Agent** → Backend'e "Tamamlandi" WebSocket mesaji
11. **Backend** → History'yi gunceller (status: success)
12. **Backend** → Frontend'e WebSocket ile bildirir
13. **Frontend** → UI'yi gunceller

### Agent'ta Neler Oluyor?
```
localhost:5432 ──> pg_dump ──> backup.sql ──> GZIP ──> backup.sql.gz
                                                           │
                                                           ▼
S3 Upload <── backup.sql.gz.enc <── AES-256 Encrypt <──────┘
```

---

## 3. RESTORE ISLEMI - ILETISIM AKISI

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ KULLANICI│      │ FRONTEND │      │ BACKEND  │      │  AGENT   │      │  CLOUD   │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │                 │
     │ 1. History'de   │                 │                 │                 │
     │ "Restore" tikla │                 │                 │                 │
     │────────────────>│                 │                 │                 │
     │                 │                 │                 │                 │
     │                 │ 2. HTTP POST    │                 │                 │
     │                 │ /history/:id/   │                 │                 │
     │                 │   restore       │                 │                 │
     │                 │────────────────>│                 │                 │
     │                 │                 │                 │                 │
     │                 │                 │ 3. Restore      │                 │
     │                 │                 │    history      │                 │
     │                 │                 │    olustur      │                 │
     │                 │                 │                 │                 │
     │                 │                 │ 4. WebSocket    │                 │
     │                 │                 │ "restore:       │                 │
     │                 │                 │  execute"       │                 │
     │                 │                 │ + DB sifresi    │                 │
     │                 │                 │ + S3 anahtarlari│                 │
     │                 │                 │ + Backup bilgisi│                 │
     │                 │                 │────────────────>│                 │
     │                 │                 │                 │                 │
     │                 │ 5. HTTP 200     │                 │                 │
     │                 │<────────────────│                 │                 │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 6. S3'den       │
     │                 │                 │                 │    backup indir │
     │                 │                 │                 │<────────────────│
     │                 │                 │                 │                 │
     │                 │                 │                 │ 7. AES-256      │
     │                 │                 │                 │    decrypt      │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 8. GZIP         │
     │                 │                 │                 │    decompress   │
     │                 │                 │                 │                 │
     │                 │                 │                 │ 9. psql ile     │
     │                 │                 │                 │    DB'ye restore│
     │                 │                 │                 │    (localhost)  │
     │                 │                 │                 │                 │
     │                 │                 │ 10. WebSocket   │                 │
     │                 │                 │ "restore:       │                 │
     │                 │                 │  completed"     │                 │
     │                 │                 │<────────────────│                 │
     │                 │                 │                 │                 │
     │                 │                 │ 11. History     │                 │
     │                 │                 │     guncelle    │                 │
     │                 │                 │                 │                 │
     │                 │ 12. WebSocket   │                 │                 │
     │                 │ "restore:       │                 │                 │
     │                 │  completed"     │                 │                 │
     │                 │<────────────────│                 │                 │
     │                 │                 │                 │                 │
     │ 13. "Restore    │                 │                 │                 │
     │    Tamamlandi!" │                 │                 │                 │
     │<────────────────│                 │                 │                 │
```

### Ozet:
1. **Kullanici** History'de "Restore" tiklar
2. **Frontend** → Backend'e HTTP POST
3. **Backend** → Restore history olusturur
4. **Backend** → Agent'a WebSocket ile restore emri (backup lokasyonu + DB bilgileri)
5. **Backend** → Frontend'e "Gonderildi" cevabi
6. **Agent** → S3'den backup dosyasini indirir
7. **Agent** → AES-256 ile decrypt (sifreli ise)
8. **Agent** → GZIP decompress (sikistirilmis ise)
9. **Agent** → psql ile localhost DB'ye restore
10. **Agent** → Backend'e "Tamamlandi" mesaji
11. **Backend** → History'yi gunceller
12. **Backend** → Frontend'e WebSocket bildirimi
13. **Frontend** → Kullaniciya gosterir

### Agent'ta Neler Oluyor? (Backup'in Tersi)
```
S3 Download ──> backup.sql.gz.enc ──> AES Decrypt ──> backup.sql.gz
                                                            │
                                                            ▼
localhost:5432 <── psql restore <── backup.sql <── GZIP Decompress
```

---

## ILETISIM PROTOKOLLERI

### HTTP (Frontend ↔ Backend)
```
- Istek/Cevap bazli
- Kullanici bir butona tikladiginda kullanilir
- JSON veri formati
- JWT token ile kimlik dogrulama
```

### WebSocket (Backend ↔ Agent)
```
- Cift yonlu, surekli baglanti
- Agent her zaman bagli (heartbeat ile canli tutuluyor)
- Asenkron islemler icin ideal
- Backend agent'a emir gonderebilir
- Agent backend'e sonuc bildirebilir
```

### Neden WebSocket?
```
HTTP ile:
  Backend: "Hey Agent, backup al"
  Agent: (30 dakika backup aliyor...)
  Backend: (30 dakika bekliyor, timeout!)  ❌

WebSocket ile:
  Backend: "Hey Agent, backup al"
  Agent: "OK, basladim"
  Backend: (baska islerle ugrasir)
  ... 30 dakika sonra ...
  Agent: "Bitti, iste sonuc!"
  Backend: "Super, kaydettim"  ✓
```

---

## SIFRELEME OZETI

| Ne Sifreleniyor | Nerede | Algoritma | Neden |
|-----------------|--------|-----------|-------|
| DB Sifresi | Backend DB | AES-256-CBC | Veritabani sifresi acik durmasin |
| S3 Access Key | Backend DB | AES-256-GCM | AWS anahtarlari acik durmasin |
| Backup Dosyasi | Agent | AES-256-GCM | Yedek dosya guvenli olsun |
| Kullanici Sifresi | Backend DB | bcrypt | Kullanici sifresi guvenli olsun |

---

## BASIT AKIS SEMASI

```
┌─────────────────────────────────────────────────────────────────────┐
│                           KULLANICI                                  │
│                         (Tarayici)                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ HTTP (REST API)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                    │
│                         (Sunucu)                                     │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ REST API │  │ Scheduler│  │ WebSocket│  │ Database │            │
│  │ Express  │  │ node-cron│  │ Socket.IO│  │ Prisma   │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│                                    │                                 │
└────────────────────────────────────┼────────────────────────────────┘
                                     │
                                     │ WebSocket (Socket.IO)
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DESKTOP AGENT                                 │
│                     (Kullanici PC)                                   │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Backup   │  │ Restore  │  │ DB Test  │  │ Cloud    │            │
│  │ Engine   │  │ Engine   │  │ Engine   │  │ Upload   │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│       │              │              │              │                 │
│       ▼              ▼              ▼              ▼                 │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              localhost Veritabanlari                │            │
│  │         (PostgreSQL, MySQL, MongoDB, MSSQL)         │            │
│  └─────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## SONUC

**3 Temel Akis:**

1. **DB Test:** Frontend → Backend → (WebSocket) → Agent → localhost DB → Agent → Backend → Frontend

2. **Backup:** Frontend → Backend → (WebSocket) → Agent → pg_dump → gzip → encrypt → S3 → Agent → Backend → Frontend

3. **Restore:** Frontend → Backend → (WebSocket) → Agent → S3 download → decrypt → decompress → psql → Agent → Backend → Frontend

**Kritik Nokta:** Backend sunucuda calisir, kullanicinin localhost'una erişemez. Bu yuzden Agent kullanicinin bilgisayarinda calisir ve localhost veritabanlarina erisir.
