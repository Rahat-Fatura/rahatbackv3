# RAHATBACK v3 - SUNUM ANLATIMI



---

## 1. DATABASE EKLEME VE TEST ETME

Şimdi kullanıcı arayüzden **"Yeni Database Ekle"** butonuna tıkladı ve formu doldurdu. Host yazdı, port yazdı, kullanıcı adı şifre girdi. Sonra **"Bağlantıyı Test Et"** butonuna bastı.

### Frontend'de Ne Oluyor?

Bu butona basınca **frontend**'de `api/database/index.js` dosyasındaki `testDatabaseConnection()` fonksiyonu çalışıyor. Bu fonksiyon axios ile backend'e HTTP POST atıyor:

```
POST /v1/databases/test-connection
```

### Backend'de Ne Oluyor?

**Backend**'e istek geldi. Önce `database.route.js`'den geçiyor, oradan `database.controller.js`'e gidiyor, oradan da asıl iş yapan yer olan `database.service.js`'e düşüyor.

Şimdi burada kritik bir şey var: **Backend sunucuda çalışıyor, kullanıcının localhost'una erişemez.** O yüzden backend diyor ki "ben bunu agent'a yönlendirmeliyim".

`websocket.service.js`'deki `sendDatabaseTestToAgent()` fonksiyonunu çağırıyor. Bu fonksiyon ne yapıyor? `activeAgents` diye bir Map var, bağlı tüm agent'lar orada tutuluyor. Kullanıcının agent'ının socket'ini buluyor ve test emrini gönderiyor:

```javascript
socket.emit('database:test', config)
```

### Agent'ta Ne Oluyor?

**Agent** tarafında `websocket.js` bu event'i dinliyor. Event gelince `database-tester.js`'i çağırıyor. O da veritabanı tipine göre doğru connector'ı seçiyor.

Mesela PostgreSQL ise `postgresql.connector.js`'deki `testConnection()` çalışıyor. Bu fonksiyon ne yapıyor?

```javascript
const client = new Client({ host, port, user, password });
await client.connect();
await client.query('SELECT version()');
await client.end();
```

Başarılıysa "bağlantı başarılı" diyor.

### Sonuç Nasıl Dönüyor?

Sonuç agent'tan backend'e WebSocket ile dönüyor:

```javascript
socket.emit('database:test:result', { success: true, version: '...' })
```

Backend bu sonucu alıyor, HTTP response olarak frontend'e iletiyor. Frontend de kullanıcıya **"Bağlantı Başarılı!"** mesajını gösteriyor.

### Kaydetme İşlemi

Kaydet butonuna basınca da benzer akış ama bu sefer `database.service.js`'deki `createDatabase()` çalışıyor.

Burada önemli bir şey var: **Şifre düz metin olarak kaydedilmiyor!**

`encryptPassword()` fonksiyonu AES-256-CBC algoritmasıyla şifreliyor ve öyle kaydediyor veritabanına.

### Akış Özeti

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ KULLANICI│     │ FRONTEND │     │ BACKEND  │     │  AGENT   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ Test Et tikla  │                │                │
     │───────────────>│                │                │
     │                │ HTTP POST      │                │
     │                │───────────────>│                │
     │                │                │ WebSocket      │
     │                │                │ database:test  │
     │                │                │───────────────>│
     │                │                │                │
     │                │                │                │ localhost'a
     │                │                │                │ baglan
     │                │                │                │
     │                │                │ WebSocket      │
     │                │                │ test:result    │
     │                │                │<───────────────│
     │                │ HTTP Response  │                │
     │                │<───────────────│                │
     │ Basarili!      │                │                │
     │<───────────────│                │                │
```

---

## 2. BACKUP JOB OLUŞTURMA

Kullanıcı **"Backup Jobs"** sayfasına gitti, **"Yeni Job Oluştur"** dedi. Database seçti, zamanlama tipini seçti (günlük diyelim), S3'e yüklenecek dedi, sıkıştırma ve şifreleme aktif, **"Oluştur"** butonuna bastı.

### Frontend'de Ne Oluyor?

**Frontend**'de `api/backup/index.js`'deki `createBackupJob()` çalışıyor, backend'e POST atıyor:

```
POST /v1/backups/jobs
```

### Backend'de Ne Oluyor?

**Backend**'de `backup.service.js`'deki `createBackupJob()` devreye giriyor.

İlk olarak database'in gerçekten bu kullanıcıya ait olduğunu kontrol ediyor - başkasının database'ine job oluşturamasın.

Sonra eğer şifreleme şifresi girdiyse, onu **bcrypt** ile hashliyor. Düz metin saklamıyoruz, hash saklıyoruz.

### Zamanlama Nasıl Çalışıyor?

Job veritabanına kaydedildikten sonra, eğer zamanlama tipi "manual" değilse, `schedule.service.js`'deki `startScheduledJob()` çağrılıyor.

Bu fonksiyon **node-cron** kütüphanesiyle bir cron task oluşturuyor:

| Zamanlama | Cron Expression | Açıklama |
|-----------|-----------------|----------|
| Saatlik | `0 * * * *` | Her saat başı |
| Günlük | `0 2 * * *` | Her gün 02:00'da |
| Haftalık | `0 2 * * 0` | Her Pazar 02:00'da |
| Aylık | `0 2 1 * *` | Her ayın 1'i 02:00'da |

Bu cron task `activeCronJobs` Map'ine ekleniyor. Zamanı gelince otomatik olarak `executeBackup()` tetiklenecek.

---

## 3. BACKUP BAŞLATMA (Manuel veya Otomatik)

Şimdi ya kullanıcı **"Çalıştır"** butonuna bastı ya da zamanı geldi cron tetikledi. İkisinde de aynı fonksiyon çalışıyor: `backup.service.js`'deki `executeBackup()`.

### Backend'de Hazırlık Aşaması

Bu fonksiyon sırayla şunları yapıyor:

**1. Job'u çek:**
```javascript
const backupJob = await backupJobModel.findById(jobId);
```

**2. Çift çalışmayı önle:**
```javascript
const runningBackup = await prisma.backupHistory.findFirst({
  where: { backupJobId, status: 'running' }
});
if (runningBackup) throw new Error('Zaten çalışıyor');
```

**3. Database şifresini çöz:**
```javascript
const dbConfig = await databaseService.getDatabaseConfig(databaseId);
// dbConfig.password artık düz metin (AES ile çözüldü)
```

**4. Agent online mı kontrol et:**
```javascript
if (!websocketService.isAgentOnline(agentId)) {
  // Backup "skipped" olarak işaretle, atla
}
```

**5. History kaydı oluştur:**
```javascript
await backupHistoryModel.create({
  backupJobId,
  status: 'running'  // Kullanıcı arayüzde görsün
});
```

**6. S3 credential'larını çöz:**
```javascript
const cloudStorage = await cloudStorageModel.findById(cloudStorageId);
// cloudStorage.accessKeyId ve secretAccessKey artık düz metin
```

### Agent'a Gönderme

Tüm bu bilgiler bir `jobData` objesi olarak hazırlanıyor:

```javascript
const jobData = {
  id: backupJob.id,
  database: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'ŞİFRE_ÇÖZÜLMÜŞ_HALİ',  // Agent'ın bağlanabilmesi için
    database: 'mydb'
  },
  compression: true,
  isEncrypted: true,
  encryptionPasswordHash: '$2b$10$...',
  storageType: 's3',
  storage: {
    accessKeyId: 'AKIA...',           // ÇÖZÜLMÜŞ
    secretAccessKey: '...',            // ÇÖZÜLMÜŞ
    region: 'eu-west-1',
    bucket: 'my-backups'
  }
};
```

Bu paket WebSocket ile agent'a gönderiliyor:

```javascript
socket.emit('job:execute', jobData)
```

### Agent'ta Backup İşlemi

**Agent** tarafında `backup-executor.js`'deki `executeBackupJob()` çalışıyor. Sırayla şunları yapıyor:

#### Adım 1: Database Dump

`postgresql.connector.js`'deki `createBackup()` fonksiyonu çalışıyor:

```javascript
spawn('pg_dump', [
  '-h', 'localhost',
  '-p', '5432',
  '-U', 'postgres',
  '-d', 'mydb',
  '-f', '/tmp/backup.sql'
]);
```

Sonuç: `backup.sql` dosyası oluştu.

#### Adım 2: Sıkıştırma

```javascript
const gzip = zlib.createGzip();
// backup.sql → backup.sql.gz
```

Sonuç: `backup.sql.gz` (boyut ~%70 küçüldü)

#### Adım 3: Şifreleme

`encryption.js`'deki `encryptFile()` çalışıyor:

```javascript
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
// backup.sql.gz → backup.sql.gz.enc
```

Sonuç: `backup.sql.gz.enc` (şifreli dosya)

#### Adım 4: S3'e Yükleme

`s3.handler.js`'deki `uploadFile()` çalışıyor:

```javascript
const s3Client = new S3Client({
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey }
});

await new Upload({
  client: s3Client,
  params: {
    Bucket: 'my-backups',
    Key: 'mydb/backup_2024-01-15.sql.gz.enc',
    Body: fileStream
  }
}).done();
```

#### Adım 5: Temizlik

Geçici dosyalar siliniyor.

#### Adım 6: Backend'e Bildir

```javascript
socket.emit('backup:completed', {
  jobId: 1,
  fileName: 'backup_2024-01-15.sql.gz.enc',
  fileSize: 1234567,
  storageUrl: 'https://my-backups.s3.eu-west-1.amazonaws.com/...',
  duration: 45000,
  isEncrypted: true
});
```

### Backend'de Sonuç İşleme

`websocket.service.js`'de `backup:completed` event'i dinleniyor. Gelince `handleAgentBackupCompleted()` çağrılıyor:

```javascript
// History'yi güncelle
await backupHistoryModel.update(historyId, {
  status: 'success',
  fileName: result.fileName,
  fileSize: result.fileSize,
  filePath: result.storageUrl
});

// Job'un son çalışma zamanını güncelle
await backupJobModel.update(jobId, {
  lastRunAt: new Date()
});

// Email bildirim gönder
await sendBackupEmailNotification(userId, 'success', details);
```

### Frontend'e Bildirim

Backend, frontend'e de WebSocket ile haber veriyor:

```javascript
io.to(`user:${userId}`).emit('backup:completed', result);
```

Frontend'de `websocket.service.js` bunu dinliyor ve UI güncelleniyor: **"Backup Tamamlandı!"**

### Akış Özeti

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ KULLANICI│     │ FRONTEND │     │ BACKEND  │     │  AGENT   │     │   S3     │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ Çalıştır tikla │                │                │                │
     │───────────────>│                │                │                │
     │                │ HTTP POST      │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Şifreleri çöz  │                │
     │                │                │ History oluştur│                │
     │                │                │                │                │
     │                │                │ job:execute    │                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │ HTTP 200       │                │                │
     │                │ "Gönderildi"   │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │                │                │ pg_dump        │
     │                │                │                │ gzip           │
     │                │                │                │ encrypt        │
     │                │                │                │                │
     │                │                │                │ Upload         │
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │ backup:        │                │
     │                │                │ completed      │                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ History update │                │
     │                │                │ Email gönder   │                │
     │                │                │                │                │
     │                │ WebSocket      │                │                │
     │                │ backup:completed               │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ Tamamlandı!    │                │                │                │
     │<───────────────│                │                │                │
```

---

## 4. RESTORE İŞLEMİ

Kullanıcı **History** sayfasında başarılı bir backup gördü ve **"Restore"** butonuna bastı.

### Frontend'de Ne Oluyor?

**Frontend**'de `api/backup/index.js`'deki `restoreBackup()` çalışıyor:

```
POST /v1/backups/history/:id/restore
```

### Backend'de Hazırlık

**Backend**'de `backup.service.js`'deki `restoreBackup()` devreye giriyor:

**1. Backup kaydını kontrol et:**
```javascript
const backup = await getBackupHistoryById(historyId);
if (backup.status !== 'success') {
  throw new Error('Sadece başarılı backup restore edilebilir');
}
```

**2. Database config'i al (şifre çözülmüş):**
```javascript
const dbConfig = await databaseService.getDatabaseConfig(backup.databaseId);
```

**3. S3 credential'larını al ve çöz:**
```javascript
const cloudStorage = await cloudStorageModel.findById(cloudStorageId);
```

**4. Restore history oluştur:**
```javascript
await prisma.restoreHistory.create({
  data: {
    backupHistoryId: backup.id,
    status: 'running'
  }
});
```

### Agent'a Gönderme

Tüm bilgiler `restoreData` objesi olarak hazırlanıyor:

```javascript
const restoreData = {
  historyId: backup.id,
  database: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'ŞİFRE_ÇÖZÜLMÜŞ',
    database: 'mydb'
  },
  backup: {
    fileName: 'backup_2024-01-15.sql.gz.enc',
    filePath: 'mydb/backup_2024-01-15.sql.gz.enc',  // S3 key
    isEncrypted: true
  },
  encryptionPasswordHash: '$2b$10$...',
  storageType: 's3',
  storage: {
    accessKeyId: 'AKIA...',
    secretAccessKey: '...',
    region: 'eu-west-1',
    bucket: 'my-backups'
  }
};
```

WebSocket ile gönderiliyor:

```javascript
socket.emit('restore:execute', restoreData)
```

### Agent'ta Restore İşlemi

**Agent** tarafında `restore-executor.js`'deki `executeRestore()` çalışıyor.

**Bu işlem backup'ın tam tersi:**

#### Adım 1: S3'den İndir

```javascript
const { GetObjectCommand } = require('@aws-sdk/client-s3');
// S3'den backup.sql.gz.enc indirildi
```

#### Adım 2: Şifre Çöz

```javascript
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
// backup.sql.gz.enc → backup.sql.gz
```

#### Adım 3: Aç (Decompress)

```javascript
const gunzip = zlib.createGunzip();
// backup.sql.gz → backup.sql
```

#### Adım 4: Database'e Restore

```javascript
spawn('psql', [
  '-h', 'localhost',
  '-p', '5432',
  '-U', 'postgres',
  '-d', 'mydb',
  '-f', '/tmp/backup.sql'
]);
```

#### Adım 5: Temizlik ve Bildirim

```javascript
// Geçici dosyaları sil
await cleanupTempFiles();

// Backend'e bildir
socket.emit('restore:completed', {
  historyId,
  success: true,
  duration: 120000
});
```

### Backend'de Sonuç İşleme

`websocket.service.js`'de `restore:completed` event'i alınıyor:

```javascript
// Restore history güncelle
await prisma.restoreHistory.update({
  where: { id: restoreHistoryId },
  data: {
    status: 'success',
    completedAt: new Date(),
    duration: data.duration
  }
});

// Backup history güncelle
await prisma.backupHistory.update({
  where: { id: data.historyId },
  data: {
    lastRestoreStatus: 'success',
    lastRestoreCompletedAt: new Date()
  }
});

// Frontend'e bildir
io.to(`user:${userId}`).emit('restore:completed', data);
```

### Akış Özeti

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ KULLANICI│     │ FRONTEND │     │ BACKEND  │     │  AGENT   │     │   S3     │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ Restore tikla  │                │                │                │
     │───────────────>│                │                │                │
     │                │ HTTP POST      │                │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Şifreleri çöz  │                │
     │                │                │ History oluştur│                │
     │                │                │                │                │
     │                │                │ restore:execute│                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │ HTTP 200       │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │                │                │ Download       │
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │                │ decrypt        │
     │                │                │                │ decompress     │
     │                │                │                │ psql restore   │
     │                │                │                │                │
     │                │                │ restore:       │                │
     │                │                │ completed      │                │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ History update │                │
     │                │                │                │                │
     │                │ WebSocket      │                │                │
     │                │ restore:completed              │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ Tamamlandı!    │                │                │                │
     │<───────────────│                │                │                │
```

---

## 5. GENEL ÖZET

### Neden 3 Katmanlı Mimari?

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  FRONTEND   │  HTTP   │   BACKEND   │   WS    │    AGENT    │
│  (Tarayıcı) │ ──────> │  (Sunucu)   │ ──────> │ (Kullanıcı  │
│             │ <────── │             │ <────── │     PC)     │
└─────────────┘         └─────────────┘         └─────────────┘
```

**Kritik Nokta:** Backend sunucuda çalışıyor, kullanıcının localhost'una erişemez. Agent kullanıcının bilgisayarında çalışıyor ve localhost'a erişebiliyor.

### İletişim Protokolleri

| Protokol | Nerede | Neden |
|----------|--------|-------|
| **HTTP** | Frontend ↔ Backend | İstek/cevap bazlı, kısa işlemler |
| **WebSocket** | Backend ↔ Agent | Sürekli bağlantı, uzun işlemler, anlık bildirimler |

### Şifreleme Katmanları

| Veri | Algoritma | Nerede |
|------|-----------|--------|
| Database şifreleri | AES-256-CBC | Backend DB'de şifreli |
| S3 credential'ları | AES-256-GCM | Backend DB'de şifreli |
| Backup dosyaları | AES-256-GCM | Agent'ta şifreleniyor |
| Kullanıcı şifreleri | bcrypt | Backend DB'de hashli |

### Her İşlemin Pattern'i

```
Frontend (HTTP) → Backend (işle) → WebSocket → Agent (asıl işi yap) → WebSocket → Backend (kaydet) → WebSocket → Frontend (göster)
```

### Kritik Servis Dosyaları

| Katman | Dosya | Görevi |
|--------|-------|--------|
| Frontend | `api/database/index.js` | Database API çağrıları |
| Frontend | `api/backup/index.js` | Backup API çağrıları |
| Frontend | `services/websocket.service.js` | WebSocket event dinleme |
| Backend | `services/database.service.js` | DB şifreleme/çözme, test |
| Backend | `services/backup.service.js` | Backup/restore mantığı |
| Backend | `services/schedule.service.js` | Zamanlama |
| Backend | `services/websocket.service.js` | Agent iletişimi |
| Agent | `services/backup-executor.js` | Backup alma |
| Agent | `services/restore-executor.js` | Restore yapma |
| Agent | `dbConnectors/postgresql.connector.js` | pg_dump/psql |
| Agent | `cloudStorage/s3.handler.js` | S3 upload/download |
