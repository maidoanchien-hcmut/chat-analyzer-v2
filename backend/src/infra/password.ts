import { AppError } from "../core/errors.ts";

export function validatePasswordPolicy(password: string) {
  if (password.length < 12) {
    throw new AppError(400, "PASSWORD_POLICY_FAILED", "Password must be at least 12 characters long.");
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;

  if (classes < 3) {
    throw new AppError(400, "PASSWORD_POLICY_FAILED", "Password must contain at least 3 character classes.");
  }
}

export async function hashPassword(password: string) {
  validatePasswordPolicy(password);
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2
  });
}

export function verifyPassword(password: string, passwordHash: string) {
  return Bun.password.verify(password, passwordHash);
}

