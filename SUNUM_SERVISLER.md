# RAHATBACK v3 - SERVIS BAZLI ILETISIM

---

## GENEL SERVIS HARITASI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         src/api/                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │    │
│  │  │ database/    │  │ backup/      │  │ cloudStorage/│  │ auth/       │  │    │
│  │  │ index.js     │  │ index.js     │  │ index.js     │  │ index.js    │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    src/services/websocket.service.js                     │    │
│  │                    (Backend'den gelen WebSocket olaylari)                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────┼───────────────────────────────────────────┘
                                       │
                          HTTP (axios) │ WebSocket (socket.io-client)
                                       │
┌──────────────────────────────────────┼───────────────────────────────────────────┐
│                              BACKEND (Node.js)                                   │
│                                      │                                           │
│  ┌───────────────────────────────────┼───────────────────────────────────────┐  │
│  │                        src/routes/v1/                                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ database.    │  │ backup.      │  │ cloudStorage.│  │ auth.       │    │  │
│  │  │ route.js     │  │ route.js     │  │ route.js     │  │ route.js    │    │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘    │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┘  │
│            │                 │                 │                 │              │
│  ┌─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┐  │
│  │         ▼                 ▼                 ▼                 ▼            │  │
│  │                      src/controllers/                                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ database.    │  │ backup.      │  │ cloudStorage.│  │ auth.       │    │  │
│  │  │ controller   │  │ controller   │  │ controller   │  │ controller  │    │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘    │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┘  │
│            │                 │                 │                 │              │
│  ┌─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┐  │
│  │         ▼                 ▼                 ▼                 ▼            │  │
│  │                       src/services/                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ database.    │  │ backup.      │  │ cloudStorage.│  │ auth.       │    │  │
│  │  │ service.js   │  │ service.js   │  │ service.js   │  │ service.js  │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘    │  │
│  │                                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │  │
│  │  │ websocket.   │  │ schedule.    │  │ email.       │                     │  │
│  │  │ service.js   │  │ service.js   │  │ service.js   │                     │  │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘                     │  │
│  └─────────┼─────────────────────────────────────────────────────────────────┘  │
│            │                                                                     │
│  ┌─────────┼─────────────────────────────────────────────────────────────────┐  │
│  │         ▼              src/models/                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ database.    │  │ backupJob.   │  │ backupHistory│  │ cloudStorage│    │  │
│  │  │ model.js     │  │ model.js     │  │ .model.js    │  │ .model.js   │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│            │                                                                     │
└────────────┼─────────────────────────────────────────────────────────────────────┘
             │
             │ WebSocket (socket.io)
             │
┌────────────┼─────────────────────────────────────────────────────────────────────┐
│            ▼                    DESKTOP AGENT (Electron)                         │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     agent-core/services/websocket.js                       │  │
│  │                     (Backend ile WebSocket baglantisi)                     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│            │                                                                     │
│  ┌─────────┼─────────────────────────────────────────────────────────────────┐  │
│  │         ▼           agent-core/services/                                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ backup-      │  │ restore-     │  │ verification-│  │ database-   │    │  │
│  │  │ executor.js  │  │ executor.js  │  │ executor.js  │  │ tester.js   │    │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘    │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┘  │
│            │                 │                 │                 │              │
│  ┌─────────┼─────────────────┼─────────────────┼─────────────────┼───────────┐  │
│  │         ▼                 ▼                 ▼                 ▼            │  │
│  │                   agent-core/services/dbConnectors/                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐    │  │
│  │  │ postgresql.  │  │ mysql.       │  │ mongodb.     │  │ mssql.      │    │  │
│  │  │ connector.js │  │ connector.js │  │ connector.js │  │ connector.js│    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘    │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│            │                                                                     │
│  ┌─────────┼─────────────────────────────────────────────────────────────────┐  │
│  │         ▼           agent-core/services/cloudStorage/                      │  │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐               │  │
│  │  │ s3.handler.js            │  │ gdrive.handler.js        │               │  │
│  │  │ (AWS S3 upload/download) │  │ (Google Drive up/down)   │               │  │
│  │  └──────────────────────────┘  └──────────────────────────┘               │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DATABASE EKLEME VE TEST ETME

### Hangi Servisler Devreye Giriyor?

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                         │
│                                                                                  │
│  DatabaseForm.js ──> api/database/index.js ──> testDatabaseConnection()         │
│       │                     │                                                    │
│       │                     │  axios.post('/v1/databases/test-connection')      │
│       │                     ▼                                                    │
└───────┼─────────────────────────────────────────────────────────────────────────┘
        │                     │
        │                     │ HTTP POST
        │                     ▼
┌───────┼─────────────────────────────────────────────────────────────────────────┐
│       │             BACKEND                                                      │
│       │                                                                          │
│       │  routes/v1/database.route.js                                            │
│       │       │                                                                  │
│       │       │  router.post('/test-connection', ...)                           │
│       │       ▼                                                                  │
│       │  controllers/database.controller.js                                      │
│       │       │                                                                  │
│       │       │  testConnection()                                               │
│       │       ▼                                                                  │
│       │  services/database.service.js                                           │
│       │       │                                                                  │
│       │       │  testConnectionWithCredentials()                                │
│       │       │       │                                                          │
│       │       │       ├──> agentModel.findFirstOnlineByUserId()                 │
│       │       │       │    (Online agent var mi?)                               │
│       │       │       │                                                          │
│       │       │       └──> websocketService.sendDatabaseTestToAgent()           │
│       │       │                  │                                               │
│       │       ▼                  │                                               │
│       │  services/websocket.service.js                                          │
│       │       │                  │                                               │
│       │       │  sendDatabaseTestToAgent()                                      │
│       │       │       │                                                          │
│       │       │       ├──> activeAgents.get(agentId)  // Socket bul             │
│       │       │       │                                                          │
│       │       │       └──> socket.emit('database:test', { config })             │
│       │       │                  │                                               │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'database:test'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          AGENT                                                   │
│       │       │                                                                  │
│       │       │  services/websocket.js                                          │
│       │       │       │                                                          │
│       │       │       │  socket.on('database:test', handler)                    │
│       │       │       ▼                                                          │
│       │       │  services/database-tester.js                                    │
│       │       │       │                                                          │
│       │       │       │  testDatabaseConnection()                               │
│       │       │       ▼                                                          │
│       │       │  services/dbConnectors/postgresql.connector.js                  │
│       │       │       │                                                          │
│       │       │       │  testConnection()                                       │
│       │       │       │       │                                                  │
│       │       │       │       ├──> new Client({ host, port, user, password })   │
│       │       │       │       ├──> client.connect()                             │
│       │       │       │       ├──> client.query('SELECT version()')             │
│       │       │       │       └──> client.end()                                 │
│       │       │       │                                                          │
│       │       │       ▼                                                          │
│       │       │  services/websocket.js                                          │
│       │       │       │                                                          │
│       │       │       └──> socket.emit('database:test:result', { success })     │
│       │       │                  │                                               │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'database:test:result'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          BACKEND                                                 │
│       │       │                                                                  │
│       │       │  services/websocket.service.js                                  │
│       │       │       │                                                          │
│       │       │       │  socket.on('database:test:result', handler)             │
│       │       │       │       │                                                  │
│       │       │       │       └──> pendingDatabaseTests.get(requestId).resolve()│
│       │       │       │                                                          │
│       │       ▼       ▼                                                          │
│       │  services/database.service.js                                           │
│       │       │                                                                  │
│       │       │  (Promise resolved, return result)                              │
│       │       ▼                                                                  │
│       │  controllers/database.controller.js                                      │
│       │       │                                                                  │
│       │       │  res.send(result)                                               │
│       │       │                                                                  │
└───────┼───────┼─────────────────────────────────────────────────────────────────┘
        │       │       │
        │       │       │ HTTP Response
        │       ▼       ▼
┌───────┼─────────────────────────────────────────────────────────────────────────┐
│       │  FRONTEND                                                                │
│       │                                                                          │
│       │  api/database/index.js                                                  │
│       │       │                                                                  │
│       │       │  return response.data                                           │
│       ▼       ▼                                                                  │
│  DatabaseForm.js                                                                 │
│       │                                                                          │
│       │  if (result.success) showSuccess('Baglanti Basarili!')                  │
│       │                                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Devreye Giren Dosyalar (Sirasi ile)

| Sira | Katman | Dosya | Fonksiyon |
|------|--------|-------|-----------|
| 1 | Frontend | `pages/databases/DatabaseForm.js` | handleTestConnection() |
| 2 | Frontend | `api/database/index.js` | testDatabaseConnection() |
| 3 | Backend | `routes/v1/database.route.js` | POST /test-connection |
| 4 | Backend | `controllers/database.controller.js` | testConnection() |
| 5 | Backend | `services/database.service.js` | testConnectionWithCredentials() |
| 6 | Backend | `models/agent.model.js` | findFirstOnlineByUserId() |
| 7 | Backend | `services/websocket.service.js` | sendDatabaseTestToAgent() |
| 8 | Agent | `services/websocket.js` | socket.on('database:test') |
| 9 | Agent | `services/database-tester.js` | testDatabaseConnection() |
| 10 | Agent | `services/dbConnectors/postgresql.connector.js` | testConnection() |
| 11 | Agent | `services/websocket.js` | socket.emit('database:test:result') |
| 12 | Backend | `services/websocket.service.js` | socket.on('database:test:result') |
| 13 | Backend | `services/database.service.js` | Promise resolved |
| 14 | Backend | `controllers/database.controller.js` | res.send(result) |
| 15 | Frontend | `api/database/index.js` | return response.data |
| 16 | Frontend | `pages/databases/DatabaseForm.js` | showSuccess() |

---

## 2. BACKUP BASLATMA

### Hangi Servisler Devreye Giriyor?

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                         │
│                                                                                  │
│  BackupJobs.js ──> api/backup/index.js ──> runBackupJob(id)                     │
│       │                  │                                                       │
│       │                  │  axios.post('/v1/backups/jobs/:id/run')              │
│       │                  ▼                                                       │
└───────┼──────────────────────────────────────────────────────────────────────────┘
        │                  │
        │                  │ HTTP POST
        │                  ▼
┌───────┼──────────────────────────────────────────────────────────────────────────┐
│       │          BACKEND                                                         │
│       │                                                                          │
│       │  routes/v1/backup.route.js                                              │
│       │       │                                                                  │
│       │       │  router.post('/jobs/:jobId/run', ...)                           │
│       │       ▼                                                                  │
│       │  controllers/backup.controller.js                                        │
│       │       │                                                                  │
│       │       │  runBackupJob()                                                 │
│       │       ▼                                                                  │
│       │  services/backup.service.js                                             │
│       │       │                                                                  │
│       │       │  executeBackup(jobId)                                           │
│       │       │       │                                                          │
│       │       │       ├──> backupJobModel.findById(jobId)                       │
│       │       │       │    (Job bilgilerini al)                                 │
│       │       │       │                                                          │
│       │       │       ├──> prisma.backupHistory.findFirst({ status: 'running' })│
│       │       │       │    (Zaten calisan var mi?)                              │
│       │       │       │                                                          │
│       │       │       ├──> databaseService.getDatabaseConfig(databaseId)        │
│       │       │       │    (DB bilgilerini al + sifre coz)                      │
│       │       │       │                                                          │
│       │       │       ├──> prisma.agent.findUnique({ id: agentId })             │
│       │       │       │    (Agent bilgilerini al)                               │
│       │       │       │                                                          │
│       │       │       ├──> websocketService.isAgentOnline(agentId)              │
│       │       │       │    (Agent online mi?)                                   │
│       │       │       │                                                          │
│       │       │       ├──> backupHistoryModel.create({ status: 'running' })     │
│       │       │       │    (History kaydı olustur)                              │
│       │       │       │                                                          │
│       │       │       ├──> cloudStorageModel.findById(cloudStorageId)           │
│       │       │       │    (S3/GDrive bilgilerini al + sifre coz)               │
│       │       │       │                                                          │
│       │       │       └──> websocketService.sendJobToAgent(agentId, jobData)    │
│       │       │                  │                                               │
│       │       ▼                  │                                               │
│       │  services/websocket.service.js                                          │
│       │       │                  │                                               │
│       │       │  sendJobToAgent()                                               │
│       │       │       │                                                          │
│       │       │       ├──> activeAgents.get(agentId)  // Socket bul             │
│       │       │       │                                                          │
│       │       │       └──> socket.emit('job:execute', jobData)                  │
│       │       │                  │                                               │
│       │       │                  │  jobData icerigi:                            │
│       │       │                  │  {                                            │
│       │       │                  │    id: 1,                                     │
│       │       │                  │    database: {                                │
│       │       │                  │      host, port, username,                    │
│       │       │                  │      password (COZULMUS!),                    │
│       │       │                  │      database                                 │
│       │       │                  │    },                                         │
│       │       │                  │    backupType: 'full',                        │
│       │       │                  │    compression: true,                         │
│       │       │                  │    isEncrypted: true,                         │
│       │       │                  │    encryptionPasswordHash: '...',             │
│       │       │                  │    storageType: 's3',                         │
│       │       │                  │    storage: {                                 │
│       │       │                  │      accessKeyId (COZULMUS!),                 │
│       │       │                  │      secretAccessKey (COZULMUS!),             │
│       │       │                  │      region, bucket                           │
│       │       │                  │    }                                          │
│       │       │                  │  }                                            │
│       │       │                  │                                               │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'job:execute'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          AGENT                                                   │
│       │       │                                                                  │
│       │       │  services/websocket.js                                          │
│       │       │       │                                                          │
│       │       │       │  socket.on('job:execute', handler)                      │
│       │       │       ▼                                                          │
│       │       │  services/backup-executor.js                                    │
│       │       │       │                                                          │
│       │       │       │  executeBackupJob(jobData, wsClient)                    │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 1: Backup basladi bildir               │
│       │       │       │       ├──> wsClient.sendBackupStarted(jobId)            │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 2: Database dump olustur               │
│       │       │       │       ├──> createDatabaseBackup(database, jobId)        │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    dbConnectors/postgresql.connector.js         │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  createBackup()                       │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> spawn('pg_dump', args)     │
│       │       │       │       │         │            (localhost'tan dump al)    │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 3: Sikistir                            │
│       │       │       │       ├──> compressFile(backupFilePath)                 │
│       │       │       │       │         │                                        │
│       │       │       │       │         └──> zlib.createGzip()                  │
│       │       │       │       │              (GZIP sikistirma)                  │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 4: Sifrele                             │
│       │       │       │       ├──> encryptFile(filePath, passwordHash)          │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    utils/encryption.js                          │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  encryptFile()                        │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> crypto.createCipheriv()    │
│       │       │       │       │         │            (AES-256-GCM sifreleme)    │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 5: Cloud'a yukle                       │
│       │       │       │       ├──> uploadToS3(filePath, storage)                │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    cloudStorage/s3.handler.js                   │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  uploadFile()                         │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       ├──> new S3Client(credentials)  │
│       │       │       │       │         │       └──> new Upload({ Bucket, Key })│
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 6: Temizlik                            │
│       │       │       │       ├──> cleanupTempFiles()                           │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 7: Tamamlandi bildir                   │
│       │       │       │       └──> wsClient.sendBackupCompleted(jobId, result)  │
│       │       │       │                  │                                       │
│       │       │       │                  │  result icerigi:                     │
│       │       │       │                  │  {                                    │
│       │       │       │                  │    fileName: 'db_2024.sql.gz.enc',   │
│       │       │       │                  │    fileSize: 1234567,                │
│       │       │       │                  │    storageUrl: 'https://s3...',      │
│       │       │       │                  │    storageKey: 'backups/db/...',     │
│       │       │       │                  │    duration: 45000,                  │
│       │       │       │                  │    isEncrypted: true                 │
│       │       │       │                  │  }                                    │
│       │       │       │                  │                                       │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'backup:completed'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          BACKEND                                                 │
│       │       │                                                                  │
│       │       │  services/websocket.service.js                                  │
│       │       │       │                                                          │
│       │       │       │  socket.on('backup:completed', handler)                 │
│       │       │       │       │                                                  │
│       │       │       │       ├──> backupService.handleAgentBackupCompleted()   │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    services/backup.service.js                   │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  handleAgentBackupCompleted()         │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       ├──> backupHistoryModel.update()│
│       │       │       │       │         │       │    (status: 'success')        │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       ├──> backupJobModel.update()    │
│       │       │       │       │         │       │    (lastRunAt: now)           │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> sendBackupEmailNotification│
│       │       │       │       │         │            (Email bildirim gonder)    │
│       │       │       │       │                                                  │
│       │       │       │       └──> io.to(`user:${userId}`).emit(...)            │
│       │       │       │            (Frontend'e WebSocket ile bildir)            │
│       │       │       │                  │                                       │
└───────┼───────┼──────────────────────────┼──────────────────────────────────────┘
        │       │                          │
        │       │                          │ WebSocket Event: 'backup:completed'
        │       ▼                          ▼
┌───────┼─────────────────────────────────────────────────────────────────────────┐
│       │  FRONTEND                                                                │
│       │                                                                          │
│       │  services/websocket.service.js                                          │
│       │       │                                                                  │
│       │       │  socket.on('backup:completed', handler)                         │
│       ▼       ▼                                                                  │
│  BackupJobs.js / BackupHistory.js                                               │
│       │                                                                          │
│       │  // UI guncelle, tablo yenile                                           │
│       │  showSuccess('Backup Tamamlandi!')                                      │
│       │                                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Devreye Giren Dosyalar (Sirasi ile)

| Sira | Katman | Dosya | Fonksiyon |
|------|--------|-------|-----------|
| 1 | Frontend | `pages/backupJobs/BackupJobs.js` | handleRunJob() |
| 2 | Frontend | `api/backup/index.js` | runBackupJob() |
| 3 | Backend | `routes/v1/backup.route.js` | POST /jobs/:id/run |
| 4 | Backend | `controllers/backup.controller.js` | runBackupJob() |
| 5 | Backend | `services/backup.service.js` | executeBackup() |
| 6 | Backend | `models/backupJob.model.js` | findById() |
| 7 | Backend | `services/database.service.js` | getDatabaseConfig() |
| 8 | Backend | `models/cloudStorage.model.js` | findById() + decryptCredentials() |
| 9 | Backend | `models/backupHistory.model.js` | create() |
| 10 | Backend | `services/websocket.service.js` | sendJobToAgent() |
| 11 | Agent | `services/websocket.js` | socket.on('job:execute') |
| 12 | Agent | `services/backup-executor.js` | executeBackupJob() |
| 13 | Agent | `services/dbConnectors/postgresql.connector.js` | createBackup() |
| 14 | Agent | `utils/encryption.js` | encryptFile() |
| 15 | Agent | `services/cloudStorage/s3.handler.js` | uploadFile() |
| 16 | Agent | `services/websocket.js` | sendBackupCompleted() |
| 17 | Backend | `services/websocket.service.js` | socket.on('backup:completed') |
| 18 | Backend | `services/backup.service.js` | handleAgentBackupCompleted() |
| 19 | Backend | `models/backupHistory.model.js` | update() |
| 20 | Backend | `services/email.service.js` | sendBackupNotification() |
| 21 | Frontend | `services/websocket.service.js` | socket.on('backup:completed') |
| 22 | Frontend | `pages/backupJobs/BackupJobs.js` | UI guncelle |

---

## 3. RESTORE ISLEMI

### Hangi Servisler Devreye Giriyor?

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                         │
│                                                                                  │
│  BackupHistory.js ──> api/backup/index.js ──> restoreBackup(id)                 │
│       │                     │                                                    │
│       │                     │  axios.post('/v1/backups/history/:id/restore')    │
│       │                     ▼                                                    │
└───────┼──────────────────────────────────────────────────────────────────────────┘
        │                     │
        │                     │ HTTP POST
        │                     ▼
┌───────┼──────────────────────────────────────────────────────────────────────────┐
│       │          BACKEND                                                         │
│       │                                                                          │
│       │  routes/v1/backup.route.js                                              │
│       │       │                                                                  │
│       │       │  router.post('/history/:historyId/restore', ...)                │
│       │       ▼                                                                  │
│       │  controllers/backup.controller.js                                        │
│       │       │                                                                  │
│       │       │  restoreBackup()                                                │
│       │       ▼                                                                  │
│       │  services/backup.service.js                                             │
│       │       │                                                                  │
│       │       │  restoreBackup(historyId, userId)                               │
│       │       │       │                                                          │
│       │       │       ├──> getBackupHistoryById(historyId)                      │
│       │       │       │    (Backup bilgilerini al)                              │
│       │       │       │                                                          │
│       │       │       ├──> databaseService.getDatabaseConfig(databaseId)        │
│       │       │       │    (DB bilgilerini al + sifre coz)                      │
│       │       │       │                                                          │
│       │       │       ├──> prisma.agent.findUnique({ id: agentId })             │
│       │       │       │    (Agent bilgilerini al)                               │
│       │       │       │                                                          │
│       │       │       ├──> backupJobModel.findById(backupJobId)                 │
│       │       │       │    (Job bilgileri - storage config)                     │
│       │       │       │                                                          │
│       │       │       ├──> cloudStorageModel.findById(cloudStorageId)           │
│       │       │       │    (Cloud credentials + sifre coz)                      │
│       │       │       │                                                          │
│       │       │       ├──> prisma.restoreHistory.create({ status: 'running' })  │
│       │       │       │    (Restore history olustur)                            │
│       │       │       │                                                          │
│       │       │       ├──> prisma.backupHistory.update({ lastRestoreStatus })   │
│       │       │       │    (Backup history guncelle)                            │
│       │       │       │                                                          │
│       │       │       └──> websocketService.sendRestoreToAgent(agentId, data)   │
│       │       │                  │                                               │
│       │       ▼                  │                                               │
│       │  services/websocket.service.js                                          │
│       │       │                  │                                               │
│       │       │  sendRestoreToAgent()                                           │
│       │       │       │                                                          │
│       │       │       └──> socket.emit('restore:execute', restoreData)          │
│       │       │                  │                                               │
│       │       │                  │  restoreData icerigi:                        │
│       │       │                  │  {                                            │
│       │       │                  │    historyId: 1,                              │
│       │       │                  │    database: { host, port, user, pass... },  │
│       │       │                  │    backup: {                                  │
│       │       │                  │      fileName, filePath, storageKey,         │
│       │       │                  │      isEncrypted                              │
│       │       │                  │    },                                         │
│       │       │                  │    encryptionPasswordHash: '...',             │
│       │       │                  │    storageType: 's3',                         │
│       │       │                  │    storage: { accessKeyId, secret... }        │
│       │       │                  │  }                                            │
│       │       │                  │                                               │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'restore:execute'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          AGENT                                                   │
│       │       │                                                                  │
│       │       │  services/websocket.js                                          │
│       │       │       │                                                          │
│       │       │       │  socket.on('restore:execute', handler)                  │
│       │       │       ▼                                                          │
│       │       │  services/restore-executor.js                                   │
│       │       │       │                                                          │
│       │       │       │  executeRestore(restoreData, wsClient)                  │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 1: Restore basladi bildir              │
│       │       │       │       ├──> wsClient.sendRestoreStarted(historyId)       │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 2: Cloud'dan indir                     │
│       │       │       │       ├──> downloadFromCloud(backup, storage)           │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    cloudStorage/s3.handler.js                   │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  downloadFile()                       │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> GetObjectCommand()         │
│       │       │       │       │         │            (S3'den indir)             │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 3: Sifre coz                           │
│       │       │       │       ├──> decryptFile(filePath, passwordHash)          │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    utils/encryption.js                          │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  decryptFile()                        │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> crypto.createDecipheriv()  │
│       │       │       │       │         │            (AES-256-GCM cozme)        │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 4: Decompress                          │
│       │       │       │       ├──> decompressFile(filePath)                     │
│       │       │       │       │         │                                        │
│       │       │       │       │         └──> zlib.createGunzip()                │
│       │       │       │       │              (GZIP ac)                          │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 5: Database'e restore                  │
│       │       │       │       ├──> restoreToDatabase(database, sqlFile)         │
│       │       │       │       │         │                                        │
│       │       │       │       │         ▼                                        │
│       │       │       │       │    dbConnectors/postgresql.connector.js         │
│       │       │       │       │         │                                        │
│       │       │       │       │         │  restore()                            │
│       │       │       │       │         │       │                                │
│       │       │       │       │         │       └──> spawn('psql', args)        │
│       │       │       │       │         │            (localhost'a restore)      │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 6: Temizlik                            │
│       │       │       │       ├──> cleanupTempFiles()                           │
│       │       │       │       │                                                  │
│       │       │       │       │  // ADIM 7: Tamamlandi bildir                   │
│       │       │       │       └──> wsClient.sendRestoreCompleted(historyId)     │
│       │       │       │                  │                                       │
└───────┼───────┼──────────────────┼──────────────────────────────────────────────┘
        │       │                  │
        │       │                  │ WebSocket Event: 'restore:completed'
        │       │                  ▼
┌───────┼───────┼──────────────────────────────────────────────────────────────────┐
│       │       │          BACKEND                                                 │
│       │       │                                                                  │
│       │       │  services/websocket.service.js                                  │
│       │       │       │                                                          │
│       │       │       │  socket.on('restore:completed', handler)                │
│       │       │       │       │                                                  │
│       │       │       │       ├──> prisma.restoreHistory.update()               │
│       │       │       │       │    (status: 'success')                          │
│       │       │       │       │                                                  │
│       │       │       │       ├──> prisma.backupHistory.update()                │
│       │       │       │       │    (lastRestoreStatus: 'success')               │
│       │       │       │       │                                                  │
│       │       │       │       └──> io.to(`user:${userId}`).emit(...)            │
│       │       │       │            (Frontend'e bildir)                          │
│       │       │       │                  │                                       │
└───────┼───────┼──────────────────────────┼──────────────────────────────────────┘
        │       │                          │
        │       │                          │ WebSocket Event: 'restore:completed'
        │       ▼                          ▼
┌───────┼─────────────────────────────────────────────────────────────────────────┐
│       │  FRONTEND                                                                │
│       │                                                                          │
│       │  services/websocket.service.js                                          │
│       │       │                                                                  │
│       │       │  socket.on('restore:completed', handler)                        │
│       ▼       ▼                                                                  │
│  BackupHistory.js                                                                │
│       │                                                                          │
│       │  showSuccess('Restore Tamamlandi!')                                     │
│       │  // Tablo yenile                                                        │
│       │                                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Devreye Giren Dosyalar (Sirasi ile)

| Sira | Katman | Dosya | Fonksiyon |
|------|--------|-------|-----------|
| 1 | Frontend | `pages/backupHistory/BackupHistory.js` | handleRestore() |
| 2 | Frontend | `api/backup/index.js` | restoreBackup() |
| 3 | Backend | `routes/v1/backup.route.js` | POST /history/:id/restore |
| 4 | Backend | `controllers/backup.controller.js` | restoreBackup() |
| 5 | Backend | `services/backup.service.js` | restoreBackup() |
| 6 | Backend | `models/backupHistory.model.js` | findById() |
| 7 | Backend | `services/database.service.js` | getDatabaseConfig() |
| 8 | Backend | `models/cloudStorage.model.js` | findById() + decryptCredentials() |
| 9 | Backend | `prisma (RestoreHistory)` | create() |
| 10 | Backend | `services/websocket.service.js` | sendRestoreToAgent() |
| 11 | Agent | `services/websocket.js` | socket.on('restore:execute') |
| 12 | Agent | `services/restore-executor.js` | executeRestore() |
| 13 | Agent | `services/cloudStorage/s3.handler.js` | downloadFile() |
| 14 | Agent | `utils/encryption.js` | decryptFile() |
| 15 | Agent | `services/dbConnectors/postgresql.connector.js` | restore() |
| 16 | Agent | `services/websocket.js` | sendRestoreCompleted() |
| 17 | Backend | `services/websocket.service.js` | socket.on('restore:completed') |
| 18 | Backend | `prisma (RestoreHistory)` | update() |
| 19 | Backend | `prisma (BackupHistory)` | update() |
| 20 | Frontend | `services/websocket.service.js` | socket.on('restore:completed') |
| 21 | Frontend | `pages/backupHistory/BackupHistory.js` | UI guncelle |

---

## OZET: HER ISLEMDE HANGI SERVISLER?

### Database Test
```
Frontend API      → database/index.js
Backend Route     → database.route.js
Backend Controller→ database.controller.js
Backend Service   → database.service.js
                  → websocket.service.js (sendDatabaseTestToAgent)
Agent             → websocket.js → database-tester.js
                  → dbConnectors/postgresql.connector.js
```

### Backup
```
Frontend API      → backup/index.js
Backend Route     → backup.route.js
Backend Controller→ backup.controller.js
Backend Service   → backup.service.js (executeBackup)
                  → database.service.js (getDatabaseConfig)
                  → websocket.service.js (sendJobToAgent)
Backend Model     → backupJob.model.js, backupHistory.model.js, cloudStorage.model.js
Agent             → websocket.js → backup-executor.js
                  → dbConnectors/postgresql.connector.js (createBackup)
                  → utils/encryption.js (encryptFile)
                  → cloudStorage/s3.handler.js (uploadFile)
```

### Restore
```
Frontend API      → backup/index.js
Backend Route     → backup.route.js
Backend Controller→ backup.controller.js
Backend Service   → backup.service.js (restoreBackup)
                  → database.service.js (getDatabaseConfig)
                  → websocket.service.js (sendRestoreToAgent)
Backend Model     → backupHistory.model.js, cloudStorage.model.js
Agent             → websocket.js → restore-executor.js
                  → cloudStorage/s3.handler.js (downloadFile)
                  → utils/encryption.js (decryptFile)
                  → dbConnectors/postgresql.connector.js (restore)
```
