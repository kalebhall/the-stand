import argon2 from 'argon2';

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return argon2.hash(plainTextPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1
  });
}

export async function verifyPassword(hashValue: string, plainTextPassword: string): Promise<boolean> {
  return argon2.verify(hashValue, plainTextPassword);
}
