import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../domain/errors";
import { withTransientRetry } from "../infrastructure/db/retry";

export const STALE_PENDING_TIMEOUT_MS = 60 * 1000;

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Uint8Array) return Array.from(value);
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalize(object[key])])
  );
}

export function computeRequestHash(commandType: string, payload: unknown): string {
  const serialized = JSON.stringify(canonicalize({ commandType, payload }));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function requireKey(idempotencyKey: string | null | undefined): string {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw new IdempotencyConflictError("Idempotency key is required for financial commands.");
  }
  return idempotencyKey.trim();
}

function parseCachedResponse<T>(responseJson: string | null): T {
  if (responseJson === null) return undefined as T;
  return reviveCachedDates(JSON.parse(responseJson)) as T;
}

function reviveCachedDates(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => reviveCachedDates(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        reviveCachedDates(childValue, childKey),
      ])
    );
  }
  if (typeof value === "string" && key && /(date|at)$/i.test(key) && !Number.isNaN(Date.parse(value))) {
    return new Date(value);
  }
  return value;
}

function assertReceiptIdentity(
  receipt: { requestHash: string; organizationId: string; commandType: string },
  input: { requestHash: string; organizationId: string; commandType: string }
): void {
  if (receipt.requestHash !== input.requestHash) {
    throw new IdempotencyConflictError("Idempotency key reused with a different payload.");
  }
  if (receipt.organizationId !== input.organizationId || receipt.commandType !== input.commandType) {
    throw new IdempotencyConflictError("Command receipt details do not match existing record.");
  }
}

export interface CommandClaim {
  actorUserId: string;
  organizationId: string;
  commandType: string;
  idempotencyKey: string;
  requestHash: string;
  claimToken: string;
}

export type CommandClaimResult<T> =
  | { status: "CLAIMED"; claim: CommandClaim }
  | { status: "COMPLETED"; result: T };

export async function findCompletedReceipt<T>(
  actorUserId: string,
  idempotencyKey: string | null | undefined,
  requestHash: string,
  organizationId?: string,
  commandType?: string
): Promise<T | null> {
  const key = requireKey(idempotencyKey);
  const existing = await prisma.commandReceipt.findUnique({
    where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey: key } },
  });
  if (!existing) return null;
  if (organizationId && commandType) {
    assertReceiptIdentity(existing, { requestHash, organizationId, commandType });
  } else if (existing.requestHash !== requestHash) {
    throw new IdempotencyConflictError();
  }
  if (existing.status === "COMPLETED") return parseCachedResponse<T>(existing.responseJson);
  return null;
}

export const DEFAULT_LEASE_DURATION_MS = 60 * 1000;

function isLeaseExpired(receipt: { leaseExpiresAt?: Date | null; createdAt: Date }): boolean {
  if (receipt.leaseExpiresAt) {
    return Date.now() > receipt.leaseExpiresAt.getTime();
  }
  return Date.now() - receipt.createdAt.getTime() > STALE_PENDING_TIMEOUT_MS;
}

async function claimReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<CommandClaim, "claimToken">,
  claimToken: string
): Promise<CommandClaimResult<never>> {
  const existing = await tx.commandReceipt.findUnique({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_DURATION_MS);

  if (!existing) {
    await tx.commandReceipt.create({
      data: {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status: "PENDING",
        claimToken,
        leaseExpiresAt,
      },
    });
    return {
      status: "CLAIMED",
      claim: { ...input, claimToken },
    };
  }

  assertReceiptIdentity(existing, input);
  if (existing.status === "COMPLETED") {
    return { status: "COMPLETED", result: parseCachedResponse<never>(existing.responseJson) };
  }

  if (!isLeaseExpired(existing)) {
    throw new IdempotencyInProgressError();
  }

  const recovered = await tx.commandReceipt.updateMany({
    where: {
      id: existing.id,
      status: "PENDING",
      claimToken: existing.claimToken,
    },
    data: {
      organizationId: input.organizationId,
      commandType: input.commandType,
      requestHash: input.requestHash,
      status: "PENDING",
      claimToken,
      responseJson: null,
      resultEntityType: null,
      resultEntityId: null,
      completedAt: null,
      createdAt: new Date(),
      leaseExpiresAt,
    },
  });
  if (recovered.count !== 1) throw new IdempotencyInProgressError();

  return {
    status: "CLAIMED",
    claim: { ...input, claimToken },
  };
}

export async function claimCommandReceipt<T>(
  actorUserId: string,
  organizationId: string,
  commandType: string,
  idempotencyKey: string | null | undefined,
  payload: unknown
): Promise<CommandClaimResult<T>> {
  const key = requireKey(idempotencyKey);
  const input = {
    actorUserId,
    organizationId,
    commandType,
    idempotencyKey: key,
    requestHash: computeRequestHash(commandType, payload),
  };
  return withTransientRetry(() =>
    prisma.$transaction((tx) => claimReceiptInTransaction(tx, input, crypto.randomUUID()))
  ) as Promise<CommandClaimResult<T>>;
}

export async function releaseCommandReceipt(claim: CommandClaim): Promise<void> {
  await prisma.commandReceipt.deleteMany({
    where: {
      actorUserId: claim.actorUserId,
      idempotencyKey: claim.idempotencyKey,
      status: "PENDING",
      claimToken: claim.claimToken,
    },
  });
}

export interface ProcessIdempotentOptions {
  claimToken?: string;
}

export type CommandDisposition = "EXECUTED" | "CACHED";

export interface ProcessIdempotentResult<T> {
  result: T;
  disposition: CommandDisposition;
}

export async function processIdempotentCommand<T>(
  actorUserId: string,
  organizationId: string,
  commandType: string,
  idempotencyKey: string | null | undefined,
  payload: unknown,
  executeFn: (
    tx: Prisma.TransactionClient
  ) => Promise<{ result: T; resultEntityType?: string; resultEntityId?: string }>,
  options: ProcessIdempotentOptions = {}
): Promise<ProcessIdempotentResult<T>> {
  const key = requireKey(idempotencyKey);
  const requestHash = computeRequestHash(commandType, payload);
  const input = { actorUserId, organizationId, commandType, idempotencyKey: key, requestHash };

  return prisma.$transaction(async (tx) => {
    let claim: CommandClaimResult<never>;
    const receipt = await tx.commandReceipt.findUnique({
      where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey: key } },
    });

    if (receipt) {
      assertReceiptIdentity(receipt, input);
      if (receipt.status === "COMPLETED") {
        return { result: parseCachedResponse<T>(receipt.responseJson), disposition: "CACHED" as const };
      }
      if (options.claimToken) {
        if (receipt.claimToken !== options.claimToken) throw new IdempotencyInProgressError();
        claim = { status: "CLAIMED", claim: { ...input, claimToken: options.claimToken } };
      } else {
        claim = await claimReceiptInTransaction(tx, input, crypto.randomUUID());
      }
    } else if (options.claimToken) {
      throw new IdempotencyInProgressError("Command receipt claim was lost. Retry the command.");
    } else {
      claim = await claimReceiptInTransaction(tx, input, crypto.randomUUID());
    }

    if (claim.status === "COMPLETED") {
      return { result: claim.result as T, disposition: "CACHED" as const };
    }

    const { result, resultEntityType, resultEntityId } = await executeFn(tx);
    const responseJson = JSON.stringify(result === undefined ? null : result);
    const completionResult = await tx.commandReceipt.updateMany({
      where: {
        actorUserId,
        idempotencyKey: key,
        status: "PENDING",
        claimToken: claim.claim.claimToken,
      },
      data: {
        status: "COMPLETED",
        resultEntityType: resultEntityType || null,
        resultEntityId: resultEntityId || null,
        responseJson,
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
    if (completionResult.count !== 1) {
      throw new IdempotencyInProgressError("Command receipt completion failed because lease was lost.");
    }
    return { result, disposition: "EXECUTED" as const };
  });
}
