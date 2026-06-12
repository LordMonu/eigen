// lib/hf-crypto.ts — AES-256-GCM encrypt/decrypt for Higgsfield tokens at rest.
// SERVER ONLY. Uses HF_TOKEN_ENC_KEY (32-byte key, 64 hex chars). Never import
// this from a client component — it reads a secret and uses node:crypto.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from 'crypto'

const ALGO: CipherGCMTypes = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.HF_TOKEN_ENC_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'HF_TOKEN_ENC_KEY missing or not 64 hex chars (32 bytes). Set it in .env.local.'
    )
  }
  return Buffer.from(hex, 'hex')
}

/** Encrypt a UTF-8 string → "iv:tag:ciphertext" (all base64). */
export function encrypt(plain: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

/** Decrypt an "iv:tag:ciphertext" blob back to the original string. */
export function decrypt(blob: string): string {
  const key = getKey()
  const [ivB64, tagB64, dataB64] = blob.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted token')
  }
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error(
      'Token decryption failed — HF_TOKEN_ENC_KEY does not match the key used when this account was connected. ' +
      'Either set the original key in your environment, or remove and re-connect the HF account.'
    )
  }
}
