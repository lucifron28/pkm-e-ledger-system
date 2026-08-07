import { Prisma } from "@prisma/client";
import {
  AccessDeniedError,
  ConcurrentModificationError,
  IdempotencyConflictError,
  InsufficientFundsError,
  IdempotencyInProgressError,
  RecordNotFoundError,
  StorageConsistencyError,
  ValidationError,
} from "../../domain/errors";

export function isTransientDatabaseConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: Transaction failed due to a write conflict or a deadlock.
    if (error.code === "P2034") return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("sqlite_busy") ||
      msg.includes("sqlite_locked") ||
      msg.includes("database is locked") ||
      msg.includes("database table is locked")
    ) {
      return true;
    }
  }
  return false;
}

export function isNonRetryableDomainError(error: unknown): boolean {
  return (
    error instanceof ValidationError ||
    error instanceof AccessDeniedError ||
    error instanceof RecordNotFoundError ||
    error instanceof InsufficientFundsError ||
    error instanceof ConcurrentModificationError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError ||
    error instanceof StorageConsistencyError
  );
}

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 25
): Promise<T> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (isNonRetryableDomainError(error) || attempt >= maxRetries || !isTransientDatabaseConflict(error)) {
        throw error;
      }
      attempt++;
      const jitter = Math.floor(Math.random() * 15);
      const delay = initialDelayMs * Math.pow(2, attempt - 1) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Transient database conflict retries exhausted.");
}
