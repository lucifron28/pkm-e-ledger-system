import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { MAX_ATTACHMENT_SIZE, validateAttachmentMetadata } from "@/lib/domain/attachments";
import { DomainError } from "@/lib/domain/errors";
import { getAttachmentStorageProviderMode } from "@/lib/infrastructure/storage/attachment-store";
import { getAttachmentOwnerIds } from "@/lib/application/attachment-input";

export const runtime = "nodejs";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function authorizePayload(payload: string | null, pathname: string) {
  if (!payload) throw new DomainError("Upload token payload is required.");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw new DomainError("Upload token payload is invalid.");
  }

  if (getString(parsed.stagedKey) !== pathname) throw new DomainError("Upload pathname does not match staged key.");
  const owner = getAttachmentOwnerIds(parsed.transactionId, parsed.cashTransferId);
  const originalName = getString(parsed.originalName);
  const mimeType = getString(parsed.mimeType);
  const sizeBytes = parsed.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes)) throw new DomainError("Attachment size is invalid.");
  const metadataError = validateAttachmentMetadata(originalName, mimeType, sizeBytes);
  if (metadataError) throw new DomainError(metadataError);

  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, await getSession());
  if (authResult.errorResponse) throw new DomainError(authResult.errorResponse.message);
  const user = authResult.user;
  if (!user.organizationId) throw new DomainError("Organization assignment required.");

  const [transaction, cashTransfer] = await Promise.all([
    owner.transactionId
      ? prisma.transaction.findFirst({ where: { id: owner.transactionId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } })
      : Promise.resolve(null),
    owner.cashTransferId
      ? prisma.cashTransfer.findFirst({ where: { id: owner.cashTransferId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!transaction && !cashTransfer) throw new DomainError("Attachment owner not found or access denied.");
  return payload;
}

export async function POST(request: NextRequest) {
  if (getAttachmentStorageProviderMode() !== "vercel-blob") {
    return NextResponse.json({ error: "Direct Blob upload is not enabled." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => ({
        allowedContentTypes: [getString(JSON.parse(clientPayload || "{}").mimeType)],
        maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
        validUntil: Date.now() + 15 * 60 * 1000,
        addRandomSuffix: false,
        allowOverwrite: false,
        tokenPayload: await authorizePayload(clientPayload, pathname),
      }),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[AttachmentUpload] Token request failed:", error);
    return NextResponse.json({ error: "Could not authorize attachment upload." }, { status: 400 });
  }
}
