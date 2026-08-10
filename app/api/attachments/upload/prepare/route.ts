import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { validateAttachmentMetadata } from "@/lib/domain/attachments";
import {
  defaultAttachmentStorageService,
  getAttachmentStorageProviderMode,
} from "@/lib/infrastructure/storage/attachment-store";
import { getAttachmentOwnerIds } from "@/lib/application/attachment-input";
import { DomainError } from "@/lib/domain/errors";

export const runtime = "nodejs";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (getAttachmentStorageProviderMode() !== "vercel-blob") {
    return NextResponse.json({ error: "Direct Blob upload is not enabled." }, { status: 404 });
  }

  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, await getSession());
  if (authResult.errorResponse) {
    return NextResponse.json({ error: authResult.errorResponse.message }, { status: authResult.errorResponse.status });
  }
  const user = authResult.user;
  if (!user.organizationId) return NextResponse.json({ error: "Organization assignment required." }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const owner = getAttachmentOwnerIds(body.transactionId, body.cashTransferId);
    const originalName = getString(body.originalName);
    const mimeType = getString(body.mimeType);
    const sizeBytes = body.sizeBytes;
    if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes)) {
      return NextResponse.json({ error: "Attachment size is invalid." }, { status: 400 });
    }
    const metadataError = validateAttachmentMetadata(originalName, mimeType, sizeBytes);
    if (metadataError) return NextResponse.json({ error: metadataError }, { status: 400 });

    const [transaction, cashTransfer] = await Promise.all([
      owner.transactionId
        ? prisma.transaction.findFirst({ where: { id: owner.transactionId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } })
        : Promise.resolve(null),
      owner.cashTransferId
        ? prisma.cashTransfer.findFirst({ where: { id: owner.cashTransferId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!transaction && !cashTransfer) {
      return NextResponse.json({ error: "Attachment owner not found or access denied." }, { status: 404 });
    }

    const extension = originalName.split(".").pop()?.toLowerCase() || "";
    const stagedKey = defaultAttachmentStorageService.createStagedUploadKey(extension);
    const clientPayload = JSON.stringify({
      transactionId: owner.transactionId,
      cashTransferId: owner.cashTransferId,
      originalName,
      mimeType,
      sizeBytes,
      stagedKey,
    });

    return NextResponse.json({ stagedKey, clientPayload });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[AttachmentUploadPrepare] Request failed:", error);
    return NextResponse.json({ error: "Could not prepare attachment upload." }, { status: 400 });
  }
}
