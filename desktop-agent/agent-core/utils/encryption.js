const crypto = require('crypto');
const fs = require('fs');
const logger = require('../config/logger');

// AES-256-GCM encryption algorithm (same as backend)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;

/**
 * Derive encryption key from password using PBKDF2
 * @param {string} password - User password
 * @param {string} salt - Salt for key derivation (hex string)
 * @returns {Buffer} Derived key
 */
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(
    password,
    Buffer.from(salt, 'hex'),
    100000, // iterations
    KEY_LENGTH,
    'sha256'
  );
};

/**
 * Encrypt file using AES-256-GCM with streaming for large files
 * @param {string} inputPath - Path to file to encrypt
 * @param {string} outputPath - Path to save encrypted file
 * @param {string} password - Encryption password (hash)
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Encryption result with metadata
 */
const encryptFile = async (inputPath, outputPath, password, progressCallback = null) => {
  try {
    // Generate salt and derive key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt.toString('hex'));

    // Generate IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Get input file size for progress tracking
    const stats = fs.statSync(inputPath);
    const totalSize = stats.size;
    let processedSize = 0;

    // Create streams
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    // Write metadata header: salt + iv
    output.write(salt);
    output.write(iv);

    // Track progress
    if (progressCallback) {
      input.on('data', (chunk) => {
        processedSize += chunk.length;
        const progress = Math.floor((processedSize / totalSize) * 100);
        progressCallback(progress);
      });
    }

    // Encrypt file with streaming
    await new Promise((resolve, reject) => {
      input
        .pipe(cipher)
        .on('error', reject)
        .pipe(output)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Get auth tag and append to file
    const authTag = cipher.getAuthTag();
    await fs.promises.appendFile(outputPath, authTag);

    const outputStats = fs.statSync(outputPath);

    logger.info(`File encrypted successfully: ${outputPath} (${outputStats.size} bytes)`);

    return {
      success: true,
      encryptedPath: outputPath,
      originalSize: totalSize,
      encryptedSize: outputStats.size,
      algorithm: ALGORITHM,
    };
  } catch (error) {
    logger.error(`Encryption failed: ${error.message}`);

    // Cleanup partial encrypted file on error
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupError) {
      logger.error(`Cleanup failed: ${cleanupError.message}`);
    }

    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Decrypt file using AES-256-GCM with streaming for large files
 * @param {string} inputPath - Path to encrypted file
 * @param {string} outputPath - Path to save decrypted file
 * @param {string} password - Decryption password (hash)
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Decryption result
 */
const decryptFile = async (inputPath, outputPath, password, progressCallback = null) => {
  try {
    // Read encrypted file header
    const fd = fs.openSync(inputPath, 'r');
    const headerSize = SALT_LENGTH + IV_LENGTH;
    const headerBuffer = Buffer.alloc(headerSize);

    fs.readSync(fd, headerBuffer, 0, headerSize, 0);

    // Extract metadata
    const salt = headerBuffer.slice(0, SALT_LENGTH);
    const iv = headerBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);

    // Get file stats
    const stats = fs.statSync(inputPath);
    const totalSize = stats.size;

    // Read auth tag from end of file
    const authTagBuffer = Buffer.alloc(AUTH_TAG_LENGTH);
    fs.readSync(fd, authTagBuffer, 0, AUTH_TAG_LENGTH, totalSize - AUTH_TAG_LENGTH);
    const authTag = authTagBuffer;

    fs.closeSync(fd);

    // Derive key
    const key = deriveKey(password, salt.toString('hex'));

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Calculate encrypted content size (excluding header and auth tag)
    const encryptedContentSize = totalSize - headerSize - AUTH_TAG_LENGTH;
    let processedSize = 0;

    // Create read stream for encrypted content only
    const input = fs.createReadStream(inputPath, {
      start: headerSize,
      end: totalSize - AUTH_TAG_LENGTH - 1,
    });

    const output = fs.createWriteStream(outputPath);

    // Track progress
    if (progressCallback) {
      input.on('data', (chunk) => {
        processedSize += chunk.length;
        const progress = Math.floor((processedSize / encryptedContentSize) * 100);
        progressCallback(progress);
      });
    }

    // Decrypt file with streaming
    await new Promise((resolve, reject) => {
      input
        .pipe(decipher)
        .on('error', (err) => {
          reject(new Error('Decryption failed. Invalid password or corrupted file.'));
        })
        .pipe(output)
        .on('finish', resolve)
        .on('error', reject);
    });

    const outputStats = fs.statSync(outputPath);

    logger.info(`File decrypted successfully: ${outputPath} (${outputStats.size} bytes)`);

    return {
      success: true,
      decryptedPath: outputPath,
      encryptedSize: totalSize,
      decryptedSize: outputStats.size,
    };
  } catch (error) {
    logger.error(`Decryption failed: ${error.message}`);

    // Cleanup partial decrypted file on error
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupError) {
      logger.error(`Cleanup failed: ${cleanupError.message}`);
    }

    throw new Error(`Decryption failed: ${error.message}`);
  }
};

/**
 * Hash password for storage/comparison
 * @param {string} password
 * @returns {string} Hashed password (hex)
 */
const hashPassword = (password) => {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
};

/**
 * Verify password hash
 * @param {string} password
 * @param {string} hash
 * @returns {boolean}
 */
const verifyPasswordHash = (password, hash) => {
  return hashPassword(password) === hash;
};

/**
 * Create encryption transform stream for streaming encryption
 * @param {string} password - Encryption password (hash)
 * @returns {Object} - { cipher, salt, iv, getAuthTag }
 */
const createEncryptionStream = (password) => {
  // Generate salt and derive key
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt.toString('hex'));

  // Generate IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  return {
    cipher,
    salt,
    iv,
    getAuthTag: () => cipher.getAuthTag(),
  };
};

/**
 * Encrypt a readable stream to a writable stream
 * @param {ReadableStream} inputStream - Input stream
 * @param {WritableStream} outputStream - Output stream
 * @param {string} password - Encryption password (hash)
 * @returns {Promise<Object>} - Encryption result
 */
const encryptStream = async (inputStream, outputStream, password) => {
  try {
    const { cipher, salt, iv, getAuthTag } = createEncryptionStream(password);

    // Write metadata header: salt + iv
    outputStream.write(salt);
    outputStream.write(iv);

    return new Promise((resolve, reject) => {
      let bytesProcessed = 0;

      inputStream.on('data', (chunk) => {
        bytesProcessed += chunk.length;
      });

      inputStream
        .pipe(cipher)
        .on('error', reject)
        .on('data', (chunk) => {
          outputStream.write(chunk);
        })
        .on('end', () => {
          // Get auth tag and append to output
          const authTag = getAuthTag();
          outputStream.write(authTag);
          outputStream.end();

          logger.info(`Stream encrypted successfully (${bytesProcessed} bytes processed)`);
          resolve({
            success: true,
            bytesProcessed,
            algorithm: ALGORITHM,
          });
        })
        .on('error', reject);
    });
  } catch (error) {
    logger.error(`Stream encryption failed: ${error.message}`);
    throw new Error(`Stream encryption failed: ${error.message}`);
  }
};

module.exports = {
  encryptFile,
  decryptFile,
  encryptStream,
  createEncryptionStream,
  hashPassword,
  verifyPasswordHash,
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  SALT_LENGTH,
};
