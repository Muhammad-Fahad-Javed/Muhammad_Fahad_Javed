// ============================================================================
// Centralised, fail-closed configuration.
//
// Security rule: the application must NEVER fall back to a predictable secret.
// In production a missing/weak JWT_SECRET is a hard configuration error; in
// development/test we generate an ephemeral random secret so local work keeps
// functioning without weakening the deployed system.
// ============================================================================
'use strict';

const crypto = require('crypto');

const MIN_JWT_SECRET_LENGTH = 32;

let ephemeralDevSecret = null;

function isProduction() {
  return (
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
  );
}

function configError(message, code) {
  const err = new Error(message);
  err.code = code || 'CONFIG_ERROR';
  err.isConfigError = true;
  return err;
}

function readSecret() {
  const raw = process.env.JWT_SECRET;
  return typeof raw === 'string' ? raw.trim() : '';
}

function hasStrongJwtSecret() {
  return readSecret().length >= MIN_JWT_SECRET_LENGTH;
}

// Returns a signing secret or throws a (non-sensitive) configuration error.
// The thrown message never contains secret material.
function getJwtSecret() {
  const secret = readSecret();
  if (secret.length >= MIN_JWT_SECRET_LENGTH) return secret;

  if (isProduction()) {
    throw configError(
      'JWT_SECRET is missing or shorter than ' +
        MIN_JWT_SECRET_LENGTH +
        ' characters. Refusing to issue or verify sessions.',
      'CONFIG_JWT_SECRET'
    );
  }

  // Development / test only: a random per-process value. It is never written
  // anywhere, never logged, and rotates on every cold start.
  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(48).toString('base64url');
  }
  return ephemeralDevSecret;
}

// Non-fatal preflight used by handlers so misconfiguration yields a controlled
// error instead of an unhandled exception at module load.
function assertStartupConfig() {
  const problems = [];
  if (isProduction() && !hasStrongJwtSecret()) {
    problems.push('JWT_SECRET must be set to a random string of at least ' + MIN_JWT_SECRET_LENGTH + ' characters.');
  }
  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set.');
  }
  return problems;
}

module.exports = {
  isProduction,
  getJwtSecret,
  hasStrongJwtSecret,
  assertStartupConfig,
  MIN_JWT_SECRET_LENGTH,
  configError,
};
