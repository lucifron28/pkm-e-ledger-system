import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { IdempotencyConflictError } from "../domain/errors";

function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(canonicalize);
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const res: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    res[k] = canonicalize(obj[k]);
  }
  return res;
}

export function computeRequestHash(commandType: string, payload: unknown): string {
  const serialized = JSON.stringify(canonicalize({ commandType, payload }));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}
export interface IdempotencyCheckResult<T> {
  cached: boolean;
  result?: T;
}

export async function processIdempotentCommand<T>(
  actorUserId: string,
  organizationId: string,
  commandType: string,
  idempotencyKey: string | null | undefined,
  payload: unknown,
  executeFn: (tx: Prisma.TransactionClient) => Promise<{ result: T; resultEntityType?: string; resultEntityId?: string }>
): Promise<T> {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw new IdempotencyConflictError("Idempotency key is required for financial commands.");
  }

  const key = idempotencyKey.trim();
  const requestHash = computeRequestHash(commandType, payload);

  // 1. Check existing receipt outside transaction
  const existingReceipt = await prisma.commandReceipt.findUnique({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId,
        idempotencyKey: key,
      },
    },
  });

  if (existingReceipt) {
    if (existingReceipt.requestHash !== requestHash) {
      throw new IdempotencyConflictError("Command failed: Idempotency key reused with a different payload.");
    }
    if (existingReceipt.status === "COMPLETED" && existingReceipt.responseJson) {
      return JSON.parse(existingReceipt.responseJson) as T;
    }
  }

  // 2. Execute command and record receipt atomically in Prisma transaction
  return prisma.$transaction(async (tx) => {
    // Re-check receipt inside transaction lock
    const inTxReceipt = await tx.commandReceipt.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId,
          idempotencyKey: key,
        },
      },
    });

    if (inTxReceipt) {
      if (inTxReceipt.requestHash !== requestHash) {
        throw new IdempotencyConflictError("Command failed: Idempotency key reused with a different payload.");
      }
      if (inTxReceipt.status === "COMPLETED" && inTxReceipt.responseJson) {
        return JSON.parse(inTxReceipt.responseJson) as T;
      }
    }

    const { result, resultEntityType, resultEntityId } = await executeFn(tx);
    const responseJson = JSON.stringify(result);

    await tx.commandReceipt.upsert({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId,
          idempotencyKey: key,
        },
      },
      update: {
        status: "COMPLETED",
        resultEntityType,
        resultEntityId,
        responseJson,
        completedAt: new Date(),
      },
      create: {
        actorUserId,
        idempotencyKey: key,
        organizationId,
        commandType,
        requestHash,
        status: "COMPLETED",
        resultEntityType,
        resultEntityId,
        responseJson,
        completedAt: new Date(),
      },
    });

    return result;
  });
}
