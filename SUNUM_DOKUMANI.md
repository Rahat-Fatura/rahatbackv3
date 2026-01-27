# RAHATBACK v3 - SUNUM DOKUMANI


---

# ICINDEKILER

1. [Proje Mimarisi](#1-proje-mimarisi)
2. [Setup ve Kurulum](#2-setup-ve-kurulum)
3. [Database Ekleme ve Test Etme](#3-database-ekleme-ve-test-etme)
4. [Cloud Storage Ekleme](#4-cloud-storage-ekleme)
5. [Backup Job Olusturma](#5-backup-job-olusturma)
6. [Zamanlama (Schedule) Sistemi](#6-zamanlama-schedule-sistemi)
7. [Backup Baslatma (Manuel ve Otomatik)](#7-backup-baslatma-manuel-ve-otomatik)
8. [History Sayfasi](#8-history-sayfasi)
9. [Restore Islemi](#9-restore-islemi)
10. [Dogrulama (Verification)](#10-dogrulama-verification)

---

# 1. PROJE MIMARISI

## 1.1 Genel Yapi

```
+------------------+       +------------------+       +------------------+
|    FRONTEND      |       |     BACKEND      |       |  DESKTOP AGENT   |
|    (React)       | <---> |   (Node.js)      | <---> |   (Electron)     |
|                  |  HTTP |                  |  WS   |                  |
| - UI Components  |       | - REST API       |       | - Backup Engine  |
| - API Calls      |       | - WebSocket      |       | - DB Connectors  |
| - State Mgmt     |       | - Scheduler      |       | - Cloud Upload   |
+------------------+       +------------------+       +------------------+
                                    |
                                    v
                           +------------------+
                           |   PostgreSQL     |
                           |   (Ana DB)       |
                           +------------------+
```

## 1.2 Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | React 18, Material-UI, AG-Grid, Socket.IO Client |
| **Backend** | Node.js, Express, Prisma ORM, Socket.IO |
| **Desktop Agent** | Electron, Node.js |
| **Veritabani** | PostgreSQL (ana), MySQL/MongoDB/MSSQL (backup hedefleri) |
| **Cloud** | AWS S3, Google Drive |

## 1.3 Kritik Dosyalar

```
backend/
  src/
    services/
      backup.service.js      # Ana backup mantigi (1540 satir)
      schedule.service.js    # Zamanlama sistemi
      websocket.service.js   # Agent iletisimi
      database.service.js    # DB sifreleme ve test
      cloudStorage.service.js # Cloud storage yonetimi

desktop-agent/
  agent-core/
    services/
      backup-executor.js     # Backup calistirma motoru
      restore-executor.js    # Restore motoru

frontend/
  src/
    api/
      backup/index.js        # Backup API cagrilari
      database/index.js      # Database API cagrilari
```

---

# 2. SETUP VE KURULUM

## 2.1 UI'da Ne Yapiliyor?

1. Kullanici kayit sayfasina gider
2. Email ve sifre girer
3. Kayit ol butonuna tiklar

## 2.2 Arka Planda Ne Oluyor?

### Adim 1: Frontend API Cagrisi

```javascript
// frontend/src/api/auth/index.js
export const register = async (data) => {
  const response = await axiosInstance.post('/v1/auth/register', data);
  return response.data;
};
```

### Adim 2: Backend Controller

```javascript
// backend/src/controllers/auth.controller.js
const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});
```

### Adim 3: Sifre Hashleme

```javascript
// backend/src/models/user.model.js
// Sifre kaydedilmeden once bcrypt ile hashlenir
const hashedPassword = await bcrypt.hash(password, 10);
```

### Adim 4: JWT Token Olusturma

```javascript
// backend/src/services/token.service.js
const generateToken = (userId, expires, type, secret = config.jwt.secret) => {
  const payload = {
    sub: userId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
  };
  return jwt.sign(payload, secret);
};
```

## 2.3 Desktop Agent Kurulumu

### UI'da:
1. Kullanici agent'i indirir ve calistirir
2. Agent otomatik olarak kayit olur

### Arka Planda:

```javascript
// desktop-agent/agent-core/services/websocket.js

// Agent UUID'si olusturulur (.agent-id dosyasinda saklanir)
const agentId = uuidv4();

// WebSocket baglantisi kurulur
const socket = io(BACKEND_URL, {
  auth: {
    token: accessToken,
    agentId: agentId
  }
});

// Backend'e kayit istegi gonderilir
socket.emit('agent:register', {
  agentId,
  deviceName: os.hostname(),
  platform: os.platform(),
  version: packageJson.version
});
```

### Backend Tarafinda:

```javascript
// backend/src/services/websocket.service.js:90-102

io.on('connection', (socket) => {
  if (connectionType === 'agent') {
    // Agent baglantisi kaydedilir
    activeAgents.set(agentId, socket);

    // Veritabaninda agent durumu guncellenir
    agentService.updateAgentStatus(agentId, 'online');
  }
});
```

---

# 3. DATABASE EKLEME VE TEST ETME

## 3.1 UI'da Ne Yapiliyor?

1. Kullanici "Databases" sayfasina gider
2. "Yeni Database Ekle" butonuna tiklar
3. Database bilgilerini girer (host, port, username, password, database)
4. "Baglanti Test Et" butonuna tiklar
5. Basariliysa "Kaydet" butonuna tiklar

## 3.2 Baglanti Test Akisi

### Adim 1: Frontend Buton Tiklama

```javascript
// frontend/src/pages/databases/DatabaseForm.js
const handleTestConnection = async () => {
  setTesting(true);
  try {
    const result = await testDatabaseConnection(formData);
    if (result.success) {
      showSuccess('Baglanti basarili!');
    }
  } catch (error) {
    showError('Baglanti hatasi: ' + error.message);
  }
  setTesting(false);
};
```

### Adim 2: API Cagrisi

```javascript
// frontend/src/api/database/index.js
export const testDatabaseConnection = async (data) => {
  const response = await axiosInstance.post('/v1/databases/test-connection', data);
  return response.data;
};
```

### Adim 3: Backend Controller

```javascript
// backend/src/controllers/database.controller.js
const testConnection = catchAsync(async (req, res) => {
  const result = await databaseService.testConnectionWithCredentials(req.body, req.user.id);
  res.send(result);
});
```

### Adim 4: Service - Agent'a Yonlendirme

```javascript
// backend/src/services/database.service.js:193-226

const testConnectionWithCredentials = async (databaseData, userId) => {
  const config = {
    type: databaseData.type,
    host: databaseData.host,
    port: databaseData.port,
    username: databaseData.username,
    password: databaseData.password,
    database: databaseData.database,
  };

  // Kullanicinin online agent'ini bul
  const onlineAgent = await agentModel.findFirstOnlineByUserId(userId);

  if (!onlineAgent) {
    // Agent yoksa backend'den test et (sadece cloud modunda calisan DB'ler icin)
    const connector = getConnector(databaseData.type);
    return await connector.testConnection(config);
  }

  // Agent varsa, WebSocket uzerinden agent'a gonder
  const result = await websocketService.sendDatabaseTestToAgent(onlineAgent.agentId, config);
  return result;
};
```

### Adim 5: WebSocket ile Agent'a Gonderme

```javascript
// backend/src/services/websocket.service.js:432-456

const sendDatabaseTestToAgent = async (agentId, config) => {
  const socket = activeAgents.get(agentId);

  // Benzersiz istek ID'si olustur
  const requestId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    // 30 saniye timeout
    const timeout = setTimeout(() => {
      pendingDatabaseTests.delete(requestId);
      reject(new Error('Database test timeout'));
    }, 30000);

    // Bekleyen istegi kaydet
    pendingDatabaseTests.set(requestId, { resolve, reject, timeout });

    // Agent'a test istegi gonder
    socket.emit('database:test', { requestId, config });
  });
};
```

### Adim 6: Agent'ta Test Islemi

```javascript
// desktop-agent/agent-core/services/database-tester.js

socket.on('database:test', async (data) => {
  const { requestId, config } = data;

  try {
    // Database tipine gore connector sec
    const connector = getConnector(config.type);

    // Baglanti testini calistir
    const result = await connector.testConnection(config);

    // Sonucu backend'e gonder
    socket.emit('database:test:result', {
      requestId,
      success: result.success,
      message: result.message,
      version: result.version
    });
  } catch (error) {
    socket.emit('database:test:result', {
      requestId,
      success: false,
      message: error.message
    });
  }
});
```

### Adim 7: PostgreSQL Connector Ornegi

```javascript
// desktop-agent/agent-core/services/dbConnectors/postgresql.connector.js

const testConnection = async (config) => {
  const { Client } = require('pg');

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
  });

  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    await client.end();

    return {
      success: true,
      message: 'Baglanti basarili',
      version: result.rows[0].version
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
};
```

## 3.3 Database Kaydetme Akisi

### Adim 1: Frontend

```javascript
// frontend/src/pages/databases/DatabaseForm.js
const handleSubmit = async () => {
  const result = await createDatabase(formData);
  navigate('/databases');
};
```

### Adim 2: Backend - Sifre Sifreleme

```javascript
// backend/src/services/database.service.js:14-20

const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';

const encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(password);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};
```

### Adim 3: Agent Otomatik Atama

```javascript
// backend/src/services/database.service.js:38-65

const createDatabase = async (userId, databaseData) => {
  // Sifreyi sifrele
  const encryptedPassword = encryptPassword(databaseData.password);

  // Kullanicinin online agent'ini bul ve otomatik ata
  let agentId = databaseData.agentId;

  if (!agentId) {
    const userAgents = await agentModel.findByUserId(userId, { isActive: true });
    const onlineAgent = userAgents.find((agent) => websocketService.isAgentOnline(agent.agentId));

    if (onlineAgent) {
      agentId = onlineAgent.id;
    } else {
      throw new ApiError(400, 'Aktif bir agent bulunamadi');
    }
  }

  // Veritabanina kaydet
  const database = await databaseModel.create({
    ...databaseData,
    userId,
    agentId,
    password: encryptedPassword,
  });

  return database;
};
```

---

# 4. CLOUD STORAGE EKLEME

## 4.1 UI'da Ne Yapiliyor?

1. Kullanici "Cloud Storage" sayfasina gider
2. "Yeni Storage Ekle" butonuna tiklar
3. Storage tipini secer (S3 veya Google Drive)
4. Credential'lari girer
5. "Test Et" butonuna tiklar
6. "Kaydet" butonuna tiklar

## 4.2 S3 Ekleme Akisi

### Adim 1: Frontend Form

```javascript
// frontend/src/pages/cloudStorage/CloudStorageForm.js
const formData = {
  storageType: 's3',
  name: 'Production S3',
  s3AccessKeyId: 'AKIA...',
  s3SecretAccessKey: '...',
  s3Region: 'eu-west-1',
  s3Bucket: 'my-backups',
  isDefault: true
};
```

### Adim 2: Backend - Credential Sifreleme

```javascript
// backend/src/services/cloudStorage.service.js:51-92

const createCloudStorage = async (userId, storageData) => {
  // Default ayarlama
  if (storageData.isDefault) {
    await cloudStorageModel.setAsDefault(null, userId, storageData.storageType);
  }

  // AWS S3 credential'larini sifrele (AES-256-GCM)
  if (storageData.storageType === 's3') {
    const accessKeyId = storageData.s3AccessKeyId.trim();
    const secretAccessKey = storageData.s3SecretAccessKey.trim();

    // Sifreleme (32 byte key + 16 byte IV + auth tag)
    const encrypted = awsS3Connector.encryptCredentials(accessKeyId, secretAccessKey);

    storageData.s3EncryptedCredentials = JSON.stringify(encrypted);

    // Plain text credential'lari sil
    delete storageData.s3AccessKeyId;
    delete storageData.s3SecretAccessKey;
  }

  const cloudStorage = await cloudStorageModel.create({
    ...storageData,
    userId,
  });

  return cloudStorage;
};
```

### Adim 3: AES-256-GCM Sifreleme Detayi

```javascript
// backend/src/utils/cloudStorage/awsS3.connector.js

const ENCRYPTION_KEY = process.env.AWS_CREDENTIALS_ENCRYPTION_KEY; // 64 hex karakter
const ALGORITHM = 'aes-256-gcm';

const encryptCredentials = (accessKeyId, secretAccessKey) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
    iv
  );

  const data = JSON.stringify({ accessKeyId, secretAccessKey });
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag(); // GCM authentication tag

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};
```

## 4.3 Google Drive Ekleme

### OAuth Akisi

```
1. Frontend: "Google ile Baglan" butonuna tikla
2. Backend: OAuth URL olustur ve redirect et
3. Google: Kullanici izin verir
4. Google: Callback URL'e code ile yonlendir
5. Backend: Code'u refresh token'a cevir
6. Backend: Refresh token'i sifrele ve kaydet
```

```javascript
// backend/src/services/cloudStorage.service.js:77-84

if (storageData.storageType === 'google_drive' && storageData.gdRefreshToken) {
  const refreshToken = storageData.gdRefreshToken.trim();

  // AES-256-GCM ile sifrele
  const encrypted = encryptGoogleDriveToken(refreshToken);
  storageData.gdRefreshToken = JSON.stringify(encrypted);
}
```

---

# 5. BACKUP JOB OLUSTURMA

## 5.1 UI'da Ne Yapiliyor?

1. Kullanici "Backup Jobs" sayfasina gider
2. "Yeni Job Olustur" butonuna tiklar
3. Database secer
4. Zamanlama tipini secer (manuel/saatlik/gunluk/haftalik/aylik/custom/advanced)
5. Backup tipini secer (full/incremental/differential)
6. Storage tipini secer (local/S3/Google Drive)
7. Opsiyonlari secer (compression, encryption, auto-verify)
8. "Olustur" butonuna tiklar

## 5.2 Frontend Form Verisi

```javascript
// frontend/src/pages/backupJobs/BackupJobForm.js
const jobData = {
  databaseId: 1,
  name: "Gunluk Production Backup",
  scheduleType: "daily",           // manual/hourly/daily/weekly/monthly/custom/advanced
  cronExpression: "0 2 * * *",     // custom icin
  advancedScheduleConfig: {...},   // advanced icin
  backupType: "full",              // full/incremental/differential
  compression: true,
  isEncrypted: true,
  encryptionPassword: "gizli123",
  autoVerifyAfterBackup: true,
  verificationLevel: "BASIC",
  storageType: "s3",               // local/s3/google_drive
  cloudStorageId: 1,
  retentionDays: 30
};
```

## 5.3 Backend Islem Akisi

### Adim 1: Controller

```javascript
// backend/src/controllers/backup.controller.js
const createBackupJob = catchAsync(async (req, res) => {
  const backupJob = await backupService.createBackupJob(req.user.id, req.body);

  // Zamanlamayi baslat (manuel degilse)
  if (backupJob.scheduleType !== 'manual') {
    await scheduleService.startScheduledJob(backupJob);
  }

  res.status(httpStatus.CREATED).send(backupJob);
});
```

### Adim 2: Service - Validation ve Kayit

```javascript
// backend/src/services/backup.service.js:144-164

const createBackupJob = async (userId, jobData) => {
  // Database sahipligini dogrula
  const database = await databaseModel.findById(jobData.databaseId);
  if (!database) {
    throw new ApiError(404, 'Database not found');
  }
  if (database.userId !== userId) {
    throw new ApiError(403, 'Access denied');
  }

  // Cloud storage dogrula (eger secildiyse)
  if (jobData.storageType === 'cloud' && jobData.cloudStorageId) {
    const cloudStorage = await cloudStorageModel.findById(jobData.cloudStorageId);
    if (!cloudStorage) {
      throw new ApiError(404, 'Cloud storage not found');
    }
  }

  // Sifreleme sifresi varsa hashle
  if (jobData.encryptionPassword) {
    jobData.encryptionPasswordHash = await bcrypt.hash(jobData.encryptionPassword, 10);
    delete jobData.encryptionPassword;
  }

  const backupJob = await backupJobModel.create(jobData);
  return backupJob;
};
```

### Adim 3: Prisma Model

```prisma
// backend/src/prisma/schema.prisma

model BackupJob {
  id                     Int       @id @default(autoincrement())
  databaseId             Int
  name                   String
  scheduleType           ScheduleType @default(manual)
  cronExpression         String?
  advancedScheduleConfig Json?
  backupType             BackupType @default(full)
  isActive               Boolean   @default(true)
  isEncrypted            Boolean   @default(false)
  encryptionPasswordHash String?
  compression            Boolean   @default(true)
  autoVerifyAfterBackup  Boolean   @default(false)
  verificationLevel      VerificationLevel @default(BASIC)
  storageType            StorageType @default(local)
  storagePath            String?
  cloudStorageId         Int?
  retentionDays          Int       @default(30)
  lastRunAt              DateTime?
  nextRunAt              DateTime?

  database               Database  @relation(...)
  cloudStorage           CloudStorage? @relation(...)
  backupHistories        BackupHistory[]
}
```

---

# 6. ZAMANLAMA (SCHEDULE) SISTEMI

## 6.1 Schedule Tipleri

| Tip | Cron Expression | Aciklama |
|-----|-----------------|----------|
| manual | - | Manuel tetikleme |
| hourly | `0 * * * *` | Her saat basinda |
| daily | `0 2 * * *` | Her gun 02:00'da |
| weekly | `0 2 * * 0` | Her Pazar 02:00'da |
| monthly | `0 2 1 * *` | Her ayin 1'i 02:00'da |
| custom | Kullanici belirler | Ornek: `30 14 * * 1-5` |
| advanced | JSON config | Kompleks kurallar |

## 6.2 Zamanlama Baslatma

### Server Basladiginda

```javascript
// backend/src/index.js

const startServer = async () => {
  // ... server baslat

  // Tum aktif job'larin zamanlamasini baslat
  await scheduleService.initializeScheduledJobs();
};
```

### initializeScheduledJobs

```javascript
// backend/src/services/schedule.service.js:202-216

const initializeScheduledJobs = async () => {
  logger.info('Initializing scheduled backup jobs...');

  // Tum aktif job'lari getir
  const activeJobs = await backupJobModel.findActiveJobs();

  // Her job icin zamanlama baslat
  for (const job of activeJobs) {
    await startScheduledJob(job);
  }

  logger.info(`Initialized ${activeJobs.length} scheduled backup jobs`);
};
```

## 6.3 Cron-Based Zamanlama

```javascript
// backend/src/services/schedule.service.js:59-168

const startScheduledJob = async (backupJob) => {
  if (backupJob.scheduleType === 'manual') {
    return; // Manuel job'lar zamanlanmaz
  }

  // Mevcut job varsa durdur
  stopScheduledJob(backupJob.id);

  // Cron expression'i al
  const cronExpression = getCronExpression(backupJob.scheduleType, backupJob.cronExpression);

  // Cron task olustur
  const task = cron.schedule(cronExpression, async () => {
    logger.info(`Executing scheduled backup for job ${backupJob.id}`);

    try {
      await backupService.executeBackup(backupJob.id);
      logger.info(`Scheduled backup completed for job ${backupJob.id}`);
    } catch (error) {
      logger.error(`Scheduled backup failed for job ${backupJob.id}: ${error.message}`);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Istanbul"
  });

  // Aktif job'lar map'ine ekle
  activeCronJobs.set(backupJob.id, task);

  // Sonraki calisma zamanini guncelle
  const nextRunAt = getNextRunTime(backupJob.scheduleType, backupJob.cronExpression);
  if (nextRunAt) {
    await backupJobModel.update(backupJob.id, { nextRunAt });
  }
};
```

## 6.4 Advanced Schedule

### Config Ornegi

```json
{
  "type": "complex",
  "rules": [
    {
      "daysOfWeek": [1, 2, 3, 4, 5],
      "times": ["02:00", "14:00"],
      "exclusions": ["2024-01-01", "2024-12-25"]
    }
  ]
}
```

### Islem Mantigi

```javascript
// backend/src/services/schedule.service.js:68-136

if (backupJob.scheduleType === 'advanced') {
  const config = JSON.parse(backupJob.advancedScheduleConfig);

  // Config'i dogrula
  const validation = advancedSchedule.validateScheduleConfig(config);
  if (!validation.valid) {
    logger.error(`Invalid advanced schedule config: ${validation.error}`);
    return;
  }

  // Her dakika kontrol eden task olustur
  const task = cron.schedule('* * * * *', async () => {
    const now = new Date();

    // Guncel job verisini al
    const currentJob = await backupJobModel.findById(backupJob.id);
    if (!currentJob || !currentJob.isActive) {
      return;
    }

    // nextRunAt zamanini kontrol et
    if (currentJob.nextRunAt && now >= new Date(currentJob.nextRunAt)) {
      logger.info(`Executing scheduled advanced backup for job ${backupJob.id}`);

      // Sonraki calisma zamanini guncelle (cift calismayi onle)
      const nextRun = advancedSchedule.getNextRunTime(config, now);
      await backupJobModel.update(backupJob.id, { nextRunAt: nextRun });

      // Backup'i calistir
      await backupService.executeBackup(backupJob.id);
    }
  }, {
    timezone: "Europe/Istanbul"
  });

  activeCronJobs.set(backupJob.id, task);
}
```

---

# 7. BACKUP BASLATMA (MANUEL VE OTOMATIK)

## 7.1 Manuel Baslatma - UI

1. Kullanici "Backup Jobs" sayfasindaki job'u bulur
2. "Calistir" butonuna tiklar

## 7.2 Frontend API Cagrisi

```javascript
// frontend/src/api/backup/index.js:29-32
export const runBackupJob = async (id) => {
  const response = await axiosInstance.post(`/v1/backups/jobs/${id}/run`);
  return response.data;
};
```

## 7.3 Backend Backup Akisi

### Adim 1: Controller

```javascript
// backend/src/controllers/backup.controller.js
const runBackupJob = catchAsync(async (req, res) => {
  const result = await backupService.executeBackup(req.params.jobId);
  res.send(result);
});
```

### Adim 2: executeBackup - Ana Fonksiyon

```javascript
// backend/src/services/backup.service.js:211-388

const executeBackup = async (backupJobId) => {
  // 1. Job'u getir
  const backupJob = await backupJobModel.findById(backupJobId);
  if (!backupJob) {
    throw new ApiError(404, 'Backup job not found');
  }

  // 2. Halihazirda calisan backup var mi kontrol et
  const runningBackup = await prisma.backupHistory.findFirst({
    where: {
      backupJobId: parseInt(backupJobId),
      status: 'running',
    },
  });

  if (runningBackup) {
    throw new ApiError(409, 'Bu job icin zaten calisan bir backup var');
  }

  // 3. Database config'i al (sifre cozulmus halde)
  const dbConfig = await databaseService.getDatabaseConfig(backupJob.databaseId);

  // 4. Agent var mi kontrol et
  if (dbConfig.agentId) {
    // AGENT VAR - WebSocket uzerinden gonder
    return await executeBackupViaAgent(backupJob, dbConfig);
  }

  // 5. Agent yoksa hata ver (localhost'a erisemeyiz)
  throw new ApiError(400, 'Backup requires a desktop agent');
};
```

### Adim 3: Agent'a Gonderme

```javascript
// backend/src/services/backup.service.js:234-366

const executeBackupViaAgent = async (backupJob, dbConfig) => {
  // Agent detaylarini al
  const agent = await prisma.agent.findUnique({
    where: { id: dbConfig.agentId },
  });

  // Agent online mi kontrol et
  const { websocketService } = require('./index');
  if (!websocketService.isAgentOnline(agent.agentId)) {
    // Backup'i "skipped" olarak kaydet
    await backupHistoryModel.create({
      backupJobId: parseInt(backupJobId),
      databaseId: parseInt(backupJob.databaseId),
      status: 'skipped',
      errorMessage: 'Agent bagli degildi, backup atlandi.',
    });

    return { success: false, status: 'skipped', message: 'Agent bagli degil' };
  }

  // History kaydini olustur (status: running)
  const backupHistory = await backupHistoryModel.create({
    backupJobId: parseInt(backupJobId),
    databaseId: parseInt(backupJob.databaseId),
    status: 'running',
    fileName: '',
    filePath: '',
  });

  // Cloud storage config'i al (sifresi cozulmus)
  let cloudStorage = null;
  if (backupJob.cloudStorageId) {
    cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
  }

  // Job verisini hazirla
  const jobData = {
    id: backupJob.id,
    database: {
      id: dbConfig.id,
      name: dbConfig.name,
      type: dbConfig.type,
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,        // COZULMUS SIFRE
      database: dbConfig.database,
    },
    backupType: backupJob.backupType,
    compression: backupJob.compression,
    isEncrypted: backupJob.isEncrypted,
    encryptionPasswordHash: backupJob.encryptionPasswordHash,
    storageType: backupJob.storageType,
    storage: cloudStorage ? {
      type: cloudStorage.storageType,
      accessKeyId: cloudStorage.accessKeyId,      // COZULMUS
      secretAccessKey: cloudStorage.secretAccessKey, // COZULMUS
      region: cloudStorage.region,
      bucket: cloudStorage.bucket,
      refreshToken: cloudStorage.refreshToken,    // COZULMUS (Google Drive)
      folderId: cloudStorage.folderId,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    } : {},
  };

  // WebSocket uzerinden agent'a gonder
  const sent = await websocketService.sendJobToAgent(agent.agentId, jobData);

  if (!sent) {
    await backupHistoryModel.update(backupHistory.id, {
      status: 'failed',
      errorMessage: 'Agent bagli degil',
    });
    throw new ApiError(503, 'Agent is not connected');
  }

  return {
    success: true,
    status: 'sent_to_agent',
    message: 'Backup job sent to agent for execution',
  };
};
```

### Adim 4: WebSocket ile Agent'a Gonderme

```javascript
// backend/src/services/websocket.service.js:373-397

const sendJobToAgent = async (agentId, jobData) => {
  const socket = activeAgents.get(agentId);

  if (!socket) {
    logger.warn(`Agent ${agentId} is not connected`);
    return false;
  }

  // Job calistirma komutunu gonder
  socket.emit('job:execute', jobData);

  return true;
};
```

## 7.4 Agent'ta Backup Calistirma

### Adim 1: WebSocket Dinleyici

```javascript
// desktop-agent/agent-core/services/websocket.js

socket.on('job:execute', async (jobData) => {
  logger.info(`Received backup job ${jobData.id}`);

  try {
    await backupExecutor.executeBackupJob(jobData, wsClient);
  } catch (error) {
    logger.error(`Backup job failed: ${error.message}`);
  }
});
```

### Adim 2: Backup Executor - Ana Akis

```javascript
// desktop-agent/agent-core/services/backup-executor.js:26-257

async function executeBackupJob(jobData, wsClient) {
  const { id: jobId, database, storageType, storage, compression, isEncrypted, encryptionPasswordHash } = jobData;

  const startTime = Date.now();

  // Backup basladi event'i gonder
  wsClient.sendBackupStarted(jobId, {
    databaseName: database.name,
    databaseType: database.type,
    storageType,
    timestamp: new Date(),
  });

  // ADIM 1: Database dump olustur
  wsClient.sendBackupProgress(jobId, { progress: 10, currentStep: 'Creating database dump' });

  const backupFilePath = await createDatabaseBackup(database, jobId);

  // ADIM 2: Compress (eger aktifse)
  let finalFilePath = backupFilePath;
  if (compression) {
    wsClient.sendBackupProgress(jobId, { progress: 60, currentStep: 'Compressing backup' });
    finalFilePath = await compressFile(backupFilePath);
  }

  // ADIM 3: Encrypt (eger aktifse)
  if (isEncrypted) {
    wsClient.sendBackupProgress(jobId, { progress: 75, currentStep: 'Encrypting backup' });

    const encryptedFilePath = `${finalFilePath}.enc`;
    await encryptFile(finalFilePath, encryptedFilePath, encryptionPasswordHash);
    finalFilePath = encryptedFilePath;
  }

  // ADIM 4: Cloud'a yukle
  let uploadResult = null;

  if (storageType === 's3') {
    wsClient.sendBackupProgress(jobId, { progress: 80, currentStep: 'Uploading to S3' });
    uploadResult = await uploadToS3(finalFilePath, database, storage);
  } else if (storageType === 'google_drive') {
    wsClient.sendBackupProgress(jobId, { progress: 80, currentStep: 'Uploading to Google Drive' });
    uploadResult = await uploadToGoogleDrive(finalFilePath, database, storage);
  }

  // ADIM 5: Gecici dosyalari temizle
  await cleanupTempFiles(backupFilePath, compressedFilePath, encryptedFilePath, storageType);

  // ADIM 6: Tamamlandi event'i gonder
  const duration = Date.now() - startTime;

  wsClient.sendBackupCompleted(jobId, {
    success: true,
    fileName: path.basename(finalFilePath),
    fileSize: uploadResult.size,
    storageType,
    storageUrl: uploadResult.url,
    storageKey: uploadResult.key,
    isEncrypted,
    duration,
    timestamp: new Date(),
  });
}
```

### Adim 3: PostgreSQL Dump Olusturma

```javascript
// desktop-agent/agent-core/services/dbConnectors/postgresql.connector.js

const createBackup = async (config, outputPath, options = {}) => {
  const { host, port, username, password, database } = config;

  // pg_dump komutu olustur
  const env = {
    ...process.env,
    PGPASSWORD: password,
  };

  const args = [
    '-h', host,
    '-p', port.toString(),
    '-U', username,
    '-d', database,
    '-f', outputPath,
    '-F', 'p',  // plain format
  ];

  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', args, { env });

    pgDump.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath);
        resolve({
          success: true,
          filePath: outputPath,
          fileSize: stats.size,
          fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        });
      } else {
        reject(new Error(`pg_dump failed with code ${code}`));
      }
    });
  });
};
```

### Adim 4: S3'e Yukleme

```javascript
// desktop-agent/agent-core/services/cloudStorage/s3.handler.js

const uploadFile = async (config, filePath, s3Key, progressCallback) => {
  const { accessKeyId, secretAccessKey, region, bucket } = config;

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const fileStream = fs.createReadStream(filePath);
  const stats = fs.statSync(filePath);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'application/gzip',
    },
  });

  upload.on('httpUploadProgress', (progress) => {
    const percentage = Math.round((progress.loaded / stats.size) * 100);
    progressCallback(percentage);
  });

  await upload.done();

  return {
    success: true,
    key: s3Key,
    size: stats.size,
    sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
    url: `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
  };
};
```

## 7.5 Backend'e Sonuc Bildirimi

### Agent Tarafindan

```javascript
// desktop-agent/agent-core/services/websocket.js

sendBackupCompleted(jobId, result) {
  this.socket.emit('backup:completed', {
    jobId,
    ...result
  });
}
```

### Backend Tarafinda

```javascript
// backend/src/services/websocket.service.js:132-141

socket.on('backup:completed', async (data) => {
  logger.info(`Backup completed on agent ${agentId}:`, data);

  // Veritabanini guncelle
  const { backupService } = require('./index');
  await backupService.handleAgentBackupCompleted(data.jobId, data);

  // Frontend'e bildir
  io.to(`user:${userId}`).emit('backup:completed', data);
});
```

### History Guncelleme

```javascript
// backend/src/services/backup.service.js:1379-1427

const handleAgentBackupCompleted = async (jobId, result) => {
  // En son history kaydini bul
  const backupHistory = await prisma.backupHistory.findFirst({
    where: { backupJobId: parseInt(jobId) },
    orderBy: { startedAt: 'desc' },
  });

  // History'yi guncelle
  await backupHistoryModel.update(backupHistory.id, {
    status: 'success',
    fileName: result.fileName,
    filePath: result.storageUrl || result.filePath,
    storageKey: result.storageKey,
    fileSize: result.fileSize,
    isEncrypted: result.isEncrypted,
    completedAt: new Date(),
  });

  // Job'un son calisma zamanini guncelle
  await backupJobModel.update(jobId, {
    lastRunAt: new Date(),
  });

  // Email bildirimi gonder
  const dbConfig = await databaseService.getDatabaseConfig(backupJob.databaseId);
  await sendBackupEmailNotification(dbConfig.userId, backupJob, dbConfig, 'success', {
    fileName: result.fileName,
    fileSize: result.fileSize,
    duration: result.duration,
  });
};
```

---

# 8. HISTORY SAYFASI

## 8.1 UI'da Ne Yapiliyor?

1. Kullanici "Backup History" sayfasina gider
2. Tum backup gecmisini gorur
3. Filtreleme yapabilir (status, database, tarih)
4. Her kayit icin: Download, Restore, Verify, Delete islemleri

## 8.2 History Listeleme

### Frontend

```javascript
// frontend/src/pages/backupHistory/BackupHistory.js
useEffect(() => {
  const fetchHistory = async () => {
    const data = await getBackupHistory({
      status: statusFilter,
      databaseId: databaseFilter,
      page: currentPage,
      limit: 20
    });
    setHistory(data.results);
    setTotalPages(data.totalPages);
  };
  fetchHistory();
}, [statusFilter, databaseFilter, currentPage]);
```

### Backend

```javascript
// backend/src/services/backup.service.js:461-463

const getBackupHistory = async (userId, filters = {}) => {
  return await backupHistoryModel.findByUserId(userId, filters);
};
```

### Model - 3 Saatten Fazla Running Olanlari Failed Yap

```javascript
// backend/src/models/backupHistory.model.js

const findByUserId = async (userId, filters = {}) => {
  // 3 saatten fazla running durumda olan backup'lari failed yap
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

  await prisma.backupHistory.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: threeHoursAgo }
    },
    data: {
      status: 'failed',
      errorMessage: 'Backup exceeded 3 hour time limit',
      completedAt: new Date()
    }
  });

  // Filtrelenmis sonuclari getir
  const results = await prisma.backupHistory.findMany({
    where: {
      database: { userId },
      ...buildFilters(filters)
    },
    include: {
      database: true,
      backupJob: true,
      restoreHistories: { take: 10, orderBy: { startedAt: 'desc' } }
    },
    orderBy: { startedAt: 'desc' },
    skip: (filters.page - 1) * filters.limit,
    take: filters.limit
  });

  return results;
};
```

## 8.3 Download Islemi

### Frontend

```javascript
// frontend/src/pages/backupHistory/BackupHistory.js
const handleDownload = async (historyId, fileName) => {
  const blob = await downloadBackup(historyId);

  // Blob'u dosya olarak indir
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
};
```

### Backend

```javascript
// backend/src/services/backup.service.js:482-533

const getBackupFilePath = async (id, userId) => {
  const backup = await getBackupHistoryById(id, userId);

  if (backup.status !== 'success') {
    throw new ApiError(400, 'Backup is not available for download');
  }

  const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

  // Cloud storage'dan mi?
  if (backupJob && backupJob.cloudStorageId && (backupJob.storageType === 'google_drive' || backupJob.storageType === 's3')) {
    const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);

    if (cloudStorage && cloudStorage.isActive) {
      // Gecici dosya yolu olustur
      const tempDownloadPath = path.join(BACKUP_STORAGE_PATH, 'temp', backup.fileName);
      await fs.mkdir(path.dirname(tempDownloadPath), { recursive: true });

      // Cloud'dan indir
      const cloudConnector = getCloudStorageConnector(cloudStorage.storageType);
      const downloadResult = await cloudConnector.downloadBackup(
        cloudStorage,
        backup.filePath, // Cloud fileId veya S3 key
        tempDownloadPath
      );

      if (!downloadResult.success) {
        throw new ApiError(500, `Failed to download from cloud: ${downloadResult.error}`);
      }

      return {
        filePath: tempDownloadPath,
        fileName: backup.fileName,
        isTemp: true, // Indirdikten sonra temizle
      };
    }
  }

  // Lokal dosya
  return {
    filePath: backup.filePath,
    fileName: backup.fileName,
    isTemp: false,
  };
};
```

---

# 9. RESTORE ISLEMI

## 9.1 UI'da Ne Yapiliyor?

1. Kullanici History sayfasinda basarili bir backup bulur
2. "Restore" butonuna tiklar
3. Onay dialogu cikar
4. "Evet, Restore Et" butonuna tiklar

## 9.2 Restore Akisi

### Adim 1: Frontend

```javascript
// frontend/src/pages/backupHistory/BackupHistory.js
const handleRestore = async (historyId) => {
  if (window.confirm('Bu backup\'i restore etmek istediginize emin misiniz?')) {
    setRestoring(true);
    try {
      await restoreBackup(historyId);
      showSuccess('Restore islemi baslatildi');
    } catch (error) {
      showError('Restore hatasi: ' + error.message);
    }
    setRestoring(false);
  }
};
```

### Adim 2: API Cagrisi

```javascript
// frontend/src/api/backup/index.js:57-60
export const restoreBackup = async (id) => {
  const response = await axiosInstance.post(`/v1/backups/history/${id}/restore`);
  return response.data;
};
```

### Adim 3: Backend Service

```javascript
// backend/src/services/backup.service.js:589-793

const restoreBackup = async (historyId, userId) => {
  // 1. Backup history'yi al ve dogrula
  const backup = await getBackupHistoryById(historyId, userId);

  if (backup.status !== 'success') {
    throw new ApiError(400, 'Only successful backups can be restored');
  }

  // 2. Database config'i al (sifre cozulmus)
  const dbConfig = await databaseService.getDatabaseConfig(backup.databaseId);

  // 3. Agent kontrolu
  if (!dbConfig.agentId) {
    throw new ApiError(400, 'Restore requires a desktop agent');
  }

  const agent = await prisma.agent.findUnique({
    where: { id: dbConfig.agentId },
  });

  // 4. Storage tipini belirle
  const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;
  let cloudStorage = null;
  let storageType = 'local';

  if (backupJob && backupJob.cloudStorageId) {
    cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
    storageType = backupJob.storageType;
  }

  // 5. Restore history kaydini olustur
  const restoreHistoryRecord = await prisma.restoreHistory.create({
    data: {
      backupHistoryId: backup.id,
      status: 'running',
      startedAt: new Date(),
      restoredBy: userId,
      databaseName: dbConfig.name,
    },
  });

  // 6. Backup history'yi guncelle
  await prisma.backupHistory.update({
    where: { id: backup.id },
    data: {
      lastRestoreStatus: 'running',
      lastRestoreStartedAt: new Date(),
    },
  });

  // 7. Restore verisini hazirla
  const restoreData = {
    historyId: backup.id,
    database: {
      id: dbConfig.id,
      name: dbConfig.name,
      database: dbConfig.database,
      type: dbConfig.type,
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
    },
    backup: {
      fileName: backup.fileName,
      filePath: backup.filePath,
      fileSize: backup.fileSize.toString(),
      isEncrypted: backup.isEncrypted,
      storageKey: storageType === 's3' && backup.filePath.startsWith('http')
        ? backup.filePath.split('/').slice(3).join('/')
        : backup.filePath,
    },
    isEncrypted: backup.isEncrypted,
    encryptionPasswordHash: backup.encryptionPasswordHash || backupJob?.encryptionPasswordHash,
    storageType,
    storage: cloudStorage ? {
      type: cloudStorage.storageType,
      accessKeyId: cloudStorage.accessKeyId,
      secretAccessKey: cloudStorage.secretAccessKey,
      region: cloudStorage.region,
      bucket: cloudStorage.bucket,
      refreshToken: cloudStorage.refreshToken,
      folderId: cloudStorage.folderId,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    } : {},
  };

  // 8. WebSocket ile agent'a gonder
  const { websocketService } = require('./index');
  const sent = await websocketService.sendRestoreToAgent(agent.agentId, restoreData);

  if (!sent) {
    // Agent bagli degil - restore'u failed olarak isaretle
    await prisma.restoreHistory.update({
      where: { id: restoreHistoryRecord.id },
      data: { status: 'failed', errorMessage: 'Agent is not connected' },
    });
    throw new ApiError(503, 'Agent is not connected');
  }

  return {
    success: true,
    status: 'sent_to_agent',
    message: 'Restore request sent to agent',
    restoreHistoryId: restoreHistoryRecord.id,
  };
};
```

### Adim 4: Agent'ta Restore

```javascript
// desktop-agent/agent-core/services/restore-executor.js

async function executeRestore(restoreData, wsClient) {
  const { historyId, database, backup, storageType, storage, isEncrypted, encryptionPasswordHash } = restoreData;

  const startTime = Date.now();

  try {
    // Restore basladi event'i
    wsClient.sendRestoreStarted(historyId, { databaseName: database.name });

    // ADIM 1: Cloud'dan indir (gerekiyorsa)
    let localFilePath = backup.filePath;

    if (storageType === 's3' || storageType === 'google_drive') {
      wsClient.sendRestoreProgress(historyId, { progress: 10, currentStep: 'Downloading from cloud' });

      localFilePath = await downloadFromCloud(backup, storage, storageType);
    }

    // ADIM 2: Decrypt (gerekiyorsa)
    if (isEncrypted) {
      wsClient.sendRestoreProgress(historyId, { progress: 40, currentStep: 'Decrypting backup' });

      const decryptedPath = localFilePath.replace('.enc', '');
      await decryptFile(localFilePath, decryptedPath, encryptionPasswordHash);
      localFilePath = decryptedPath;
    }

    // ADIM 3: Decompress (gerekiyorsa)
    if (localFilePath.endsWith('.gz')) {
      wsClient.sendRestoreProgress(historyId, { progress: 60, currentStep: 'Decompressing backup' });

      const decompressedPath = localFilePath.replace('.gz', '');
      await decompressFile(localFilePath, decompressedPath);
      localFilePath = decompressedPath;
    }

    // ADIM 4: Database'e restore et
    wsClient.sendRestoreProgress(historyId, { progress: 70, currentStep: 'Restoring to database' });

    const connector = getConnector(database.type);
    await connector.restore(database, localFilePath);

    // ADIM 5: Temizlik
    await cleanupTempFiles(localFilePath);

    // ADIM 6: Basarili event'i gonder
    const duration = Date.now() - startTime;
    wsClient.sendRestoreCompleted(historyId, {
      success: true,
      duration,
      message: 'Restore completed successfully',
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    wsClient.sendRestoreFailed(historyId, {
      error: error.message,
      duration,
    });
    throw error;
  }
}
```

### Adim 5: PostgreSQL Restore

```javascript
// desktop-agent/agent-core/services/dbConnectors/postgresql.connector.js

const restore = async (config, backupFilePath) => {
  const { host, port, username, password, database } = config;

  const env = {
    ...process.env,
    PGPASSWORD: password,
  };

  // psql ile restore
  const args = [
    '-h', host,
    '-p', port.toString(),
    '-U', username,
    '-d', database,
    '-f', backupFilePath,
  ];

  return new Promise((resolve, reject) => {
    const psql = spawn('psql', args, { env });

    let stderr = '';
    psql.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    psql.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`psql restore failed: ${stderr}`));
      }
    });
  });
};
```

### Adim 6: Backend'e Sonuc Bildirimi

```javascript
// backend/src/services/websocket.service.js:165-214

socket.on('restore:completed', async (data) => {
  logger.info(`Restore completed on agent ${agentId}:`, data);

  const completedAt = new Date();
  const duration = data.duration || 0;

  // Running durumundaki restore'u bul
  const runningRestore = await prisma.restoreHistory.findFirst({
    where: {
      backupHistoryId: data.historyId,
      status: 'running',
    },
    orderBy: { startedAt: 'desc' },
  });

  if (runningRestore) {
    // Restore history'yi guncelle
    await prisma.restoreHistory.update({
      where: { id: runningRestore.id },
      data: {
        status: 'success',
        completedAt,
        duration,
      },
    });

    // Backup history'yi guncelle
    await prisma.backupHistory.update({
      where: { id: data.historyId },
      data: {
        lastRestoreStatus: 'success',
        lastRestoreCompletedAt: completedAt,
        lastRestoreDuration: duration,
      },
    });
  }

  // Frontend'e bildir
  io.to(`user:${userId}`).emit('restore:completed', data);
});
```

---

# 10. DOGRULAMA (VERIFICATION)

## 10.1 UI'da Ne Yapiliyor?

1. Kullanici History sayfasinda basarili bir backup bulur
2. "Dogrula" butonuna tiklar
3. Dogrulama seviyesini secer (BASIC/DATABASE/FULL)
4. Dogrulama sonucunu gorur

## 10.2 Dogrulama Seviyeleri

| Seviye | Ne Yapar | Sure |
|--------|----------|------|
| **BASIC** | Checksum dogrulama, dosya boyutu, compression integrity | Saniyeler |
| **DATABASE** | BASIC + schema validation, metadata extraction | Dakikalar |
| **FULL** | DATABASE + test restore (gercek restore denemesi) | Dakikalar-Saatler |

## 10.3 Verification Akisi

### Adim 1: Frontend

```javascript
// frontend/src/api/backup/index.js:67-72
export const verifyBackup = async (id, verificationLevel = 'BASIC') => {
  const response = await axiosInstance.post(`/v1/backups/history/${id}/verify`, {
    verificationLevel,
  });
  return response.data;
};
```

### Adim 2: Backend Service

```javascript
// backend/src/services/backup.service.js:888-1033

const verifyBackup = async (backupHistoryId, verificationLevel = 'BASIC', userId = null) => {
  const backup = await backupHistoryModel.findById(backupHistoryId);

  if (!backup) {
    throw new ApiError(404, 'Backup not found');
  }

  if (backup.status !== 'success') {
    throw new ApiError(400, 'Only successful backups can be verified');
  }

  // Agent varsa agent uzerinden dogrula
  if (backup.database.agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: backup.database.agentId },
    });

    // Agent online mi?
    const websocketService = require('./websocket.service');
    if (!websocketService.isAgentOnline(agent.agentId)) {
      throw new ApiError(503, 'Agent is offline');
    }

    // Storage config'i hazirla
    const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;
    let storage = null;
    let storageType = 'local';

    if (backupJob && backupJob.cloudStorageId) {
      const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
      if (cloudStorage && cloudStorage.isActive) {
        storageType = cloudStorage.storageType;
        storage = cloudStorageModel.decryptCredentials(cloudStorage);
      }
    }

    // Verification verisini hazirla
    const verificationData = {
      historyId: Number(backupHistoryId),
      database: {
        id: Number(backup.database.id),
        name: backup.database.name,
        type: backup.database.type,
        host: backup.database.host,
        port: Number(backup.database.port),
        username: backup.database.username,
        password: backup.database.password,
        database: backup.database.database,
      },
      backup: {
        id: Number(backup.id),
        fileName: backup.fileName,
        filePath: backup.filePath,
        storageKey: backup.storageKey,
        fileSize: backup.fileSize ? Number(backup.fileSize) : 0,
        checksumValue: backup.checksumValue,
        checksumAlgorithm: backup.checksumAlgorithm || 'sha256',
      },
      storageType,
      storage: storage ? {
        type: storage.storageType,
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
        region: storage.region,
        bucket: storage.bucket,
        refreshToken: storage.refreshToken,
        folderId: storage.folderId,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      } : null,
      verificationLevel,
      isEncrypted: backup.isEncrypted,
      encryptionPasswordHash: backup.encryptionPasswordHash || backupJob?.encryptionPasswordHash,
    };

    // Agent'a gonder ve sonucu bekle
    const result = await websocketService.sendVerificationToAgent(agent.agentId, verificationData);
    return result;
  }

  // Agent yoksa backend'de dogrula (legacy)
  // ... (backend-based verification code)
};
```

### Adim 3: Agent'ta Verification

```javascript
// desktop-agent/agent-core/services/verification-executor.js

async function executeVerification(verificationData, wsClient) {
  const { historyId, backup, database, verificationLevel, storageType, storage, isEncrypted, encryptionPasswordHash } = verificationData;

  const startTime = Date.now();
  const checks = [];

  try {
    wsClient.sendVerificationStarted(historyId);

    // ADIM 1: Dosyayi indir (cloud'daysa)
    let localFilePath = backup.filePath;

    if (storageType !== 'local') {
      wsClient.sendVerificationProgress(historyId, { progress: 10, currentStep: 'Downloading backup' });
      localFilePath = await downloadFromCloud(backup, storage, storageType);
    }

    // BASIC KONTROLLER

    // 1. Dosya var mi?
    checks.push(await verifyFileExistence(localFilePath));

    // 2. Boyut dogru mu?
    checks.push(await verifyFileSize(localFilePath, backup.fileSize));

    // 3. Checksum dogru mu?
    checks.push(await verifyChecksum(localFilePath, backup.checksumValue, backup.checksumAlgorithm));

    // 4. Compression gecerli mi?
    if (localFilePath.includes('.gz')) {
      checks.push(await verifyCompressionIntegrity(localFilePath));
    }

    // 5. Encryption gecerli mi?
    if (isEncrypted) {
      checks.push(await verifyEncryptionIntegrity(localFilePath, encryptionPasswordHash));
    }

    // DATABASE KONTROLLERI (seviye >= DATABASE)
    if (verificationLevel === 'DATABASE' || verificationLevel === 'FULL') {
      wsClient.sendVerificationProgress(historyId, { progress: 50, currentStep: 'Database verification' });

      // Decrypt ve decompress yap
      let sqlFilePath = localFilePath;
      if (isEncrypted) {
        sqlFilePath = await decryptFile(localFilePath, encryptionPasswordHash);
      }
      if (sqlFilePath.endsWith('.gz')) {
        sqlFilePath = await decompressFile(sqlFilePath);
      }

      // Schema dogrulama
      checks.push(await verifyDatabaseSchema(sqlFilePath, database.type));
    }

    // FULL KONTROLLER (test restore)
    if (verificationLevel === 'FULL') {
      wsClient.sendVerificationProgress(historyId, { progress: 70, currentStep: 'Test restore' });

      checks.push(await performTestRestore(backup, database, localFilePath, encryptionPasswordHash));
    }

    // Sonucu hesapla
    const failedChecks = checks.filter(c => c.passed === false);
    const overallStatus = failedChecks.length === 0 ? 'PASSED' : 'FAILED';

    const duration = Date.now() - startTime;

    // Sonucu gonder
    wsClient.sendVerificationCompleted(historyId, {
      verificationResult: {
        overallStatus,
        verificationMethod: verificationLevel,
        checks,
      },
      duration,
    });

  } catch (error) {
    wsClient.sendVerificationFailed(historyId, error.message);
    throw error;
  }
}
```

### Adim 4: Checksum Dogrulama

```javascript
// desktop-agent/agent-core/services/verification-executor.js

const verifyChecksum = async (filePath, expectedChecksum, algorithm = 'sha256') => {
  const crypto = require('crypto');
  const fs = require('fs');

  const hash = crypto.createHash(algorithm);
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => {
      const checksum = hash.digest('hex');

      if (!expectedChecksum) {
        // Ilk dogrulama - checksum'i kaydet
        resolve({
          check: 'checksum',
          passed: true,
          checksum,
          message: 'Checksum hesaplandi',
          note: 'Ilk hesaplama',
        });
      } else {
        // Mevcut checksum ile karsilastir
        const isValid = checksum === expectedChecksum;
        resolve({
          check: 'checksum',
          passed: isValid,
          checksum,
          expected: expectedChecksum,
          message: isValid ? 'Checksum dogru' : 'Checksum uyusmuyor',
          error: isValid ? null : 'Dosya bozuk olabilir',
        });
      }
    });
    stream.on('error', (error) => {
      resolve({ check: 'checksum', passed: false, error: error.message });
    });
  });
};
```

### Adim 5: Backend'e Sonuc Bildirimi

```javascript
// backend/src/services/websocket.service.js:297-314

socket.on('verification:completed', async (data) => {
  logger.info(`Verification completed on agent ${agentId}:`, data);

  // Backup history'yi guncelle
  const { backupService } = require('./index');
  await backupService.handleAgentVerificationCompleted(data.historyId, data);

  // Bekleyen promise'i resolve et
  const pendingRequest = pendingVerificationRequests.get(data.historyId);
  if (pendingRequest) {
    clearTimeout(pendingRequest.timeout);
    pendingRequest.resolve(data.verificationResult);
    pendingVerificationRequests.delete(data.historyId);
  }

  // Frontend'e bildir
  io.to(`user:${userId}`).emit('verification:completed', data);
});
```

---

# EKLER

## A. Sifreleme Algoritmalari

| Veri Tipi | Algoritma | Key Boyutu |
|-----------|-----------|------------|
| Database Passwords | AES-256-CBC | 32 byte |
| Cloud Credentials | AES-256-GCM | 32 byte |
| Backup Files | AES-256-GCM | Derived from hash |
| User Passwords | bcrypt | 10 rounds |
| JWT Tokens | HMAC-SHA256 | Variable |

## B. WebSocket Event Listesi

| Event | Yonu | Aciklama |
|-------|------|----------|
| `job:execute` | Backend -> Agent | Backup job calistir |
| `backup:started` | Agent -> Backend | Backup basladi |
| `backup:progress` | Agent -> Backend | Ilerleme bildirimi |
| `backup:completed` | Agent -> Backend | Backup tamamlandi |
| `backup:failed` | Agent -> Backend | Backup hatasi |
| `restore:execute` | Backend -> Agent | Restore calistir |
| `restore:started` | Agent -> Backend | Restore basladi |
| `restore:completed` | Agent -> Backend | Restore tamamlandi |
| `restore:failed` | Agent -> Backend | Restore hatasi |
| `verification:execute` | Backend -> Agent | Dogrulama calistir |
| `verification:completed` | Agent -> Backend | Dogrulama tamamlandi |
| `database:test` | Backend -> Agent | DB baglanti testi |
| `database:test:result` | Agent -> Backend | Test sonucu |
| `heartbeat` | Iki yonlu | Baglanti canli mi |

## C. Status Degerleri

### Backup Status
- `running` - Calisiyor
- `success` - Basarili
- `failed` - Basarisiz
- `cancelled` - Iptal edildi
- `skipped` - Atlandi (agent offline)

### Restore Status
- `running` - Calisiyor
- `success` - Basarili
- `failed` - Basarisiz

### Verification Status
- `PENDING` - Bekliyor
- `PASSED` - Gecti
- `FAILED` - Kaldi
- `SKIPPED` - Atlandi

---

# SONUC

Bu dokuman, RAHATBACK v3 projesinin UI'dan yapilan her islemin arka planda nasil calistigini detayli sekilde aciklamaktadir.

**Kritik Noktalar:**
1. Tum hassas veriler (sifreler, credential'lar) AES-256 ile sifrelenir
2. Agent ve Backend arasindaki iletisim WebSocket uzerinden gerceklesir
3. Database islemleri agent uzerinden yapilir (localhost'a backend erisemez)
4. Her backup icin history kaydedilir ve durum takibi yapilir
5. Cron-based ve advanced zamanlama desteklenir
6. Cloud storage (S3, Google Drive) entegrasyonu mevcuttur
7. Backup dogrulama 3 seviyede yapilabilir (BASIC, DATABASE, FULL)

**Sunum Icin Onemli:**
"UI'da bu butona tiklayinca arka planda ne oluyor?" sorusuna bu dokumandaki akis semalari ve kod parcalari ile cevap verilebilir.
