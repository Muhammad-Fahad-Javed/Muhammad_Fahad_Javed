// ============================================================================
// Token encryption for integration credentials.
//
// OAuth access/refresh tokens are personal secrets. They are never stored in
// plaintext, never returned by an API and never logged. Each value is sealed
// with AES-256-GCM (authenticated encryption), so a tampered ciphertext fails
// to open instead of silently decrypting to rubbish.
//
// Format:  v1.<iv>.<tag>.<ciphertext>      (all base64url)
//
// The additional authenticated data (AAD) binds a ciphertext to its provider,
// so a token sealed for one integration cannot be replayed into another row.
//
// Fail-closed: without SYNC_ENCRYPTION_KEY every seal()/open() throws. There is
// deliberately no fallback to a predictable or derived-from-nothing key.
// ============================================================================
'use strict';

const crypto = require('crypto');

const { configError } = require('../config');

const VERSION = 'v1';
const MIN_KEY_LENGTH = 32;
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce size
const TAG_BYTES = 16;

// Derives the 32-byte cipher key from the configured secret. SHA-256 is used so
// an operator can supply a passphrase of arbitrary length; the minimum length
// check is what protects entropy.
function getKey() {
  const raw = process.env.SYNC_ENCRYPTION_KEY;
  const secret = typeof raw === 'string' ? raw.trim() : '';

  if (secret.length < MIN_KEY_LENGTH) {
    throw configError(
      'SYNC_ENCRYPTION_KEY is missing or shorter than ' +
        MIN_KEY_LENGTH +
        ' characters. Integration tokens cannot be stored or read without it.',
      'CONFIG_SYNC_KEY'
    );
  }

  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function aadBuffer(aad) {
  if (aad === undefined || aad === null || aad === '') return null;
  return Buffer.from(String(aad), 'utf8');
}

function isSealed(value) {
  return typeof value === 'string' && value.startsWith(VERSION + '.') && value.split('.').length === 4;
}

function seal(plaintext, aad) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Cannot seal an empty value.');
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const additional = aadBuffer(aad);
  if (additional) cipher.setAAD(additional);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function open(sealed, aad) {
  if (typeof sealed !== 'string' || !sealed) {
    throw new Error('No ciphertext to open.');
  }

  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported ciphertext format.');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed ciphertext.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  const additional = aadBuffer(aad);
  if (additional) decipher.setAAD(additional);
  decipher.setAuthTag(tag);

  // Throws if the tag does not verify (tampered ciphertext, wrong AAD, wrong key).
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// Convenience wrapper for the common case: bind to a provider name.
function sealForProvider(plaintext, provider) {
  return seal(plaintext, 'integration:' + provider);
}

function openForProvider(sealed, provider) {
  return open(sealed, 'integration:' + provider);
}

module.exports = {
  seal,
  open,
  isSealed,
  sealForProvider,
  openForProvider,
  MIN_KEY_LENGTH,
  VERSION,
};
