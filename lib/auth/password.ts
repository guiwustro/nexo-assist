import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de senha com scrypt (node:crypto, sem dependência nova).
 * Formato guardado: `scrypt$N$r$p$<salt base64>$<hash base64>`, com salt de 16 bytes por senha.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** `true` só se o hash é válido e bate com a senha. Hash ausente ou malformado → `false`. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!password || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  // Limites para um hash adulterado não travar o servidor.
  if (![n, r, p].every(Number.isInteger) || n < 2 || n > 2 ** 17 || (n & (n - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) {
    return false;
  }
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const key = await derive(password, salt, expected.length, { N: n, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Para e-mail inexistente: gasta o mesmo tempo de uma conferência real,
 * assim a resposta não revela se o e-mail existe.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('nexo-hash-de-referencia');
  await verifyPassword(password || 'x', await dummy);
}
