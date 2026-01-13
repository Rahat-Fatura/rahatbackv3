# Cloud Storage Setup Guide

This guide explains how to configure cloud storage (AWS S3 and Google Drive) for backup functionality in production.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [AWS S3 Encryption Key Setup (CRITICAL)](#aws-s3-encryption-key-setup-critical)
- [AWS S3 Configuration](#aws-s3-configuration)
- [Google Drive OAuth Setup](#google-drive-oauth-setup)
- [Testing Your Configuration](#testing-your-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js installed
- Access to your server's environment variables
- Google Cloud Platform account (for Google Drive)
- AWS account (for S3) or S3-compatible service

---

## AWS S3 Encryption Key Setup (CRITICAL)

### ⚠️ **CRITICAL SECURITY REQUIREMENT**

The AWS credentials encryption key is **MANDATORY** and must be configured before starting the application. Without this key:
- The application **will not start**
- AWS credentials cannot be stored or retrieved
- User backup functionality will be unavailable

### Why is this important?

All AWS credentials (Access Key ID and Secret Access Key) are encrypted before being stored in the database using AES-256-GCM encryption. This encryption key:

- **Must remain constant forever** - Changing it will make all stored credentials unreadable
- **Must be 64 hexadecimal characters** (32 bytes)
- **Must be kept secure** - If lost, all AWS credentials in the database are permanently lost

### Step 1: Generate the Encryption Key

Run this command in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output (DO NOT USE THIS - generate your own!):
```
a1b2c3d4e5f6789abcdef1234567890abcdef1234567890abcdef1234567890
```

### Step 2: Add to Environment Variables

#### For Development (.env file):

```env
AWS_CREDENTIALS_ENCRYPTION_KEY=YOUR_GENERATED_KEY_HERE
```

#### For Production:

Choose one of these methods:

**Option 1: Environment Variable (Recommended)**
```bash
export AWS_CREDENTIALS_ENCRYPTION_KEY="your_generated_key_here"
```

**Option 2: Docker**
```bash
docker run -e AWS_CREDENTIALS_ENCRYPTION_KEY="your_generated_key_here" ...
```

**Option 3: AWS Secrets Manager**
```bash
# Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name prod/backup/aws-encryption-key \
  --secret-string "your_generated_key_here"

# Retrieve in your app startup
```

**Option 4: Kubernetes Secret**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: backup-secrets
type: Opaque
data:
  aws-encryption-key: <base64-encoded-key>
```

### Step 3: Backup the Key Securely

**IMPORTANT**: Keep a secure backup of this key! Options:

1. **Password Manager** - Store in 1Password, LastPass, etc.
2. **Encrypted File** - Store in encrypted vault
3. **Secrets Management Service** - AWS Secrets Manager, HashiCorp Vault
4. **Secure Note** - In physically secure location

⚠️ **Never commit this key to git or version control!**

### Step 4: Verify Configuration

Start the application. If the key is missing or invalid, you'll see:

```
CRITICAL SECURITY ERROR: AWS_CREDENTIALS_ENCRYPTION_KEY environment variable is required!
This key is used to encrypt/decrypt AWS credentials in the database.
Generate a secure key using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you see this error, go back to Step 2.

---

## AWS S3 Configuration

### Supported Services

This system supports:
- **AWS S3** (official)
- **MinIO** (self-hosted S3-compatible)
- **DigitalOcean Spaces**
- **Backblaze B2**
- **Wasabi**
- Any S3-compatible service

### User Configuration (Via Web UI)

Users can add their own S3 storage through the web interface:

1. Navigate to **Cloud Storage** section
2. Click **Add Storage**
3. Select **S3**
4. Fill in the form:
   - **Name**: Descriptive name (e.g., "My AWS S3")
   - **Region**: AWS region (e.g., us-east-1)
   - **Bucket Name**: Your S3 bucket name
   - **Access Key ID**: AWS IAM access key
   - **Secret Access Key**: AWS IAM secret key
   - **Endpoint** (optional): For S3-compatible services
     - MinIO: `http://localhost:9000`
     - DigitalOcean Spaces: `https://nyc3.digitaloceanspaces.com`
     - Backblaze: `https://s3.us-west-001.backblazeb2.com`

### IAM Policy for Backup Storage

Create an IAM user with this policy (least privilege):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-backup-bucket-name",
        "arn:aws:s3:::your-backup-bucket-name/*"
      ]
    }
  ]
}
```

### Endpoint URL Format

When using S3-compatible services, the endpoint must be a valid URL:

✅ **Valid formats:**
- `https://s3.amazonaws.com`
- `http://localhost:9000` (MinIO)
- `https://nyc3.digitaloceanspaces.com`
- `https://s3.us-west-001.backblazeb2.com`

❌ **Invalid formats:**
- `s3.amazonaws.com` (missing protocol)
- `ftp://example.com` (wrong protocol)
- `just-a-hostname` (not a URL)

---

## Google Drive OAuth Setup

### Overview

Google Drive integration requires OAuth 2.0 authentication. Users authenticate once, and the system stores a refresh token to access their Drive.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID

### Step 2: Enable Google Drive API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Enable**

### Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen:
   - User Type: **External** (or Internal for G Suite)
   - App name: Your app name
   - User support email: Your email
   - Scopes: Add `https://www.googleapis.com/auth/drive.file`
   - Test users: Add your email (for testing)
4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: "Backup System"
   - Authorized redirect URIs: **This is critical!**

### Step 4: Configure Redirect URIs

Add **ALL** your environments to Authorized redirect URIs:

**Development:**
```
http://localhost:3000/v1/cloud-storage/google-drive/callback
```

**Staging:**
```
https://staging.yourdomain.com/v1/cloud-storage/google-drive/callback
```

**Production:**
```
https://yourdomain.com/v1/cloud-storage/google-drive/callback
```

⚠️ **Common Mistakes:**
- ❌ Using HTTP in production (must be HTTPS)
- ❌ Forgetting trailing slash or including extra paths
- ❌ Not adding all environments
- ❌ Typos in domain name

### Step 5: Copy Credentials

After creating OAuth client:
1. Copy **Client ID**
2. Copy **Client Secret**
3. Add to environment variables

### Step 6: Configure Environment Variables

#### Development (.env):
```env
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/v1/cloud-storage/google-drive/callback
```

#### Production:
```env
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
GOOGLE_REDIRECT_URI=https://yourdomain.com/v1/cloud-storage/google-drive/callback
```

### Step 7: OAuth Consent Screen Setup

For production, you need to verify your app:

1. **Internal App** (G Suite only):
   - Only users in your organization can use it
   - No verification needed

2. **External App** (Public):
   - Must go through Google verification
   - Fill out OAuth consent screen completely
   - Submit for verification (can take days/weeks)
   - Until verified, limited to 100 users

**For Testing:**
- Add test users in OAuth consent screen
- They can use the app even if unverified

### Step 8: Test OAuth Flow

1. Log into your app
2. Go to Cloud Storage settings
3. Click "Connect Google Drive"
4. Popup window should open
5. You should see Google login screen
6. After authentication, popup should close
7. Google Drive should appear as connected

**Troubleshooting:**
- If popup doesn't open: Check browser popup blocker
- If error "redirect_uri_mismatch": Check redirect URI in Google Console matches exactly
- If error "access_denied": User cancelled or app not approved

---

## Testing Your Configuration

### Test Encryption Key

```bash
# Start the application
npm start

# If you see this, encryption key is missing:
CRITICAL SECURITY ERROR: AWS_CREDENTIALS_ENCRYPTION_KEY environment variable is required!

# If app starts normally, encryption key is configured ✓
```

### Test S3 Connection

1. Log into the web UI
2. Go to **Cloud Storage**
3. Add new S3 storage
4. Click **Test Connection**
5. Should see: "Successfully connected to bucket: your-bucket-name"

### Test Google Drive Connection

1. Go to **Cloud Storage**
2. Click **Connect Google Drive**
3. Should redirect to Google login
4. After authentication, should see success message
5. Click **Test Connection**
6. Should see user email and storage quota

### Test Backup Creation

1. Create a backup job
2. Select cloud storage (S3 or Google Drive)
3. Run backup manually
4. Check backup history for success
5. Verify file appears in cloud storage

---

## Troubleshooting

### Encryption Key Issues

**Error: "CRITICAL SECURITY ERROR: AWS_CREDENTIALS_ENCRYPTION_KEY environment variable is required!"**

- **Solution**: Generate and set the encryption key (see [AWS S3 Encryption Key Setup](#aws-s3-encryption-key-setup-critical))

**Error: "INVALID AWS_CREDENTIALS_ENCRYPTION_KEY: Must be exactly 64 hexadecimal characters"**

- **Solution**: Your key is wrong format. Generate a new one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

**Error: "Failed to decrypt credentials: Unsupported state or unable to authenticate data"**

- **Cause**: Encryption key changed after credentials were stored
- **Solution**:
  1. If you have backup of old key, restore it
  2. If not, users must re-enter all AWS credentials
  3. **Prevention**: Never change the encryption key!

### S3 Connection Issues

**Error: "Invalid S3 endpoint URL format"**

- **Solution**: Endpoint must be valid URL with http:// or https://

**Error: "The authorization header is malformed"**

- **Solution**: Check Access Key ID and Secret Access Key are correct

**Error: "Access Denied"**

- **Solution**: Check IAM policy allows s3:PutObject, s3:GetObject, s3:ListBucket

**Error: "NoSuchBucket"**

- **Solution**: Bucket name is wrong or doesn't exist in specified region

### Google Drive Issues

**Error: "redirect_uri_mismatch"**

- **Solution**: Add exact redirect URI to Google Console Authorized redirect URIs
- Check for typos, http vs https, trailing slashes

**Error: "access_denied"**

- **Solution**: User cancelled authentication or app not approved
- Add user to test users if app is unverified

**Error: "invalid_grant"**

- **Solution**: Refresh token expired or revoked
- User needs to reconnect Google Drive

**Popup doesn't open**

- **Solution**: Check browser popup blocker settings
- Try different browser

### Backup Upload Issues

**Backup creates but doesn't upload to cloud**

- Check cloud storage is set as active
- Check backup job has cloudStorageId configured
- Check logs for upload errors
- Test connection to cloud storage

**Error: "Quota exceeded" (Google Drive)**

- **Solution**: User's Google Drive is full
- User needs to free up space or upgrade storage

---

## Security Best Practices

1. **Encryption Key**
   - Never commit to git
   - Store in secrets management system
   - Keep secure backup
   - Never change after initial setup

2. **AWS Credentials**
   - Use IAM users with minimal permissions
   - Rotate keys periodically
   - Never use root account credentials

3. **Google OAuth**
   - Store Client Secret securely
   - Use HTTPS in production
   - Monitor OAuth usage in Google Console

4. **Database**
   - All credentials stored encrypted
   - Regular database backups
   - Secure database access

5. **Environment Variables**
   - Never commit .env file
   - Use secrets management in production
   - Different credentials per environment

---

## Support

For issues or questions:
1. Check this documentation
2. Check application logs
3. Review error messages carefully
4. Contact system administrator

---

**Last Updated**: October 2025
