import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export function hashSecret(secret) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(String(secret), salt, 32).toString('hex')}`;
}

export function verifySecret(secret, encoded) {
  if (typeof encoded !== 'string') return false;
  const [algorithm, salt, hex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(String(secret), salt, expected.length || 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const digest = value => createHash('sha256').update(String(value)).digest('hex');

export function encryptPin(pin, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(pin), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.');
}

export function decryptPin(encoded, key) {
  try {
    const [iv, tag, data] = encoded.split('.').map(value => Buffer.from(value, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch { return null; }
}
