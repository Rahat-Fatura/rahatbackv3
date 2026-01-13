# Rahat Backup Agent

Desktop agent application for managing local database backups.

## Features

- Connect to local databases (MySQL, PostgreSQL, MongoDB, MSSQL)
- Automated backup scheduling
- Cloud storage support (AWS S3, Google Drive)
- Real-time status updates
- Encryption and compression support

## Installation

1. Download the installer for your platform
2. Install the application
3. Launch Rahat Backup Agent
4. Login with your credentials
5. Agent will automatically register

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Configuration

Create a `.env` file in the root directory:

```env
BACKEND_URL=http://localhost:3000
BACKEND_WS_URL=ws://localhost:3000
AGENT_VERSION=1.0.0
BACKUP_STORAGE_PATH=./backups
LOG_LEVEL=info
```

## Requirements

- Node.js 16+
- Windows 10+, macOS 10.14+, or Linux

## License

MIT
