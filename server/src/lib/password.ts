import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, k: number, o: object) => Promise<Buffer>

// ponytail: scrypt della libreria standard invece di argon2id. L'hosting condiviso
// può non completare una compilazione nativa; scrypt non ha dipendenze.
// Cambiare KDF significa sostituire questo solo modulo.
const PARAMS = { N: 16384, r: 8, p: 1 }
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEYLEN, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string]
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scryptAsync(password, salt, expected.length, { N: +N, r: +r, p: +p })
  return key.length === expected.length && timingSafeEqual(key, expected)
}
