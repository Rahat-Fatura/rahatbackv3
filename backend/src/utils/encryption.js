const crypto = require('crypto');
const logger = require('../config/logger');

// AES-256-GCM encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;

/**
 * Generate a random encryption key
 * @returns {string} Hex string of encryption key
 */
const generateEncryptionKey = () => {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
};

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
 * Encrypt file using AES-256-GCM
 * @param {string} inputPath - Path to file to encrypt
 * @param {string} outputPath - Path to save encrypted file
 * @param {string} password - Encryption password
 * @returns {Promise<Object>} Encryption result with metadata
 */
const encryptFile = async (inputPath, outputPath, password) => {
  const fs = require('fs').promises;
  const fsSync = require('fs');

  try {
    // Generate salt and derive key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt.toString('hex'));

    // Generate IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Create streams
    const input = fsSync.createReadStream(inputPath);
    const output = fsSync.createWriteStream(outputPath);

    // Write metadata header: salt + iv
    output.write(salt);
    output.write(iv);

    // Encrypt file
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
    await fs.appendFile(outputPath, authTag);

    const stats = await fs.stat(outputPath);

    logger.info(`File encrypted successfully: ${outputPath}`);

    return {
      success: true,
      encryptedPath: outputPath,
      fileSize: stats.size,
      algorithm: ALGORITHM,
    };
  } catch (error) {
    logger.error(`Encryption failed: ${error.message}`);
    throw error;
  }
};

/**
 * Decrypt file using AES-256-GCM
 * @param {string} inputPath - Path to encrypted file
 * @param {string} outputPath - Path to save decrypted file
 * @param {string} password - Decryption password
 * @returns {Promise<Object>} Decryption result
 */
const decryptFile = async (inputPath, outputPath, password) => {
  const fs = require('fs').promises;
  const fsSync = require('fs');

  try {
    // Read encrypted file
    const encryptedData = await fs.readFile(inputPath);

    // Extract metadata
    const salt = encryptedData.slice(0, SALT_LENGTH);
    const iv = encryptedData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = encryptedData.slice(-AUTH_TAG_LENGTH);
    const encryptedContent = encryptedData.slice(
      SALT_LENGTH + IV_LENGTH,
      -AUTH_TAG_LENGTH
    );

    // Derive key
    const key = deriveKey(password, salt.toString('hex'));

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encryptedContent),
      decipher.final(),
    ]);

    // Write decrypted file
    await fs.writeFile(outputPath, decrypted);

    const stats = await fs.stat(outputPath);

    logger.info(`File decrypted successfully: ${outputPath}`);

    return {
      success: true,
      decryptedPath: outputPath,
      fileSize: stats.size,
    };
  } catch (error) {
    logger.error(`Decryption failed: ${error.message}`);
    throw new Error('Decryption failed. Invalid password or corrupted file.');
  }
};

/**
 * Encrypt stream (for large files)
 * @param {ReadableStream} inputStream
 * @param {WritableStream} outputStream
 * @param {string} password
 * @returns {Promise<Object>}
 */
const encryptStream = async (inputStream, outputStream, password) => {
  try {
    // Generate salt and derive key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(password, salt.toString('hex'));

    // Generate IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Write metadata
    outputStream.write(salt);
    outputStream.write(iv);

    // Encrypt stream
    await new Promise((resolve, reject) => {
      inputStream
        .pipe(cipher)
        .on('error', reject)
        .pipe(outputStream, { end: false })
        .on('finish', () => {
          // Append auth tag
          const authTag = cipher.getAuthTag();
          outputStream.write(authTag);
          outputStream.end();
          resolve();
        })
        .on('error', reject);
    });

    logger.info('Stream encrypted successfully');

    return {
      success: true,
      algorithm: ALGORITHM,
    };
  } catch (error) {
    logger.error(`Stream encryption failed: ${error.message}`);
    throw error;
  }
};

/**
 * Hash password for storage
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

module.exports = {
  generateEncryptionKey,
  deriveKey,
  encryptFile,
  decryptFile,
  encryptStream,
  hashPassword,
  verifyPasswordHash,
  ALGORITHM,
};
