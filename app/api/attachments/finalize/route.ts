import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";
import { finalizeStagedAttachmentUpload } from "@/lib/actions/attachments";
import { getAttachmentOwnerIds } from "@/lib/application/attachment-input";
import { DomainError } from "@/lib/domain/errors";
import { getAttachmentStorageProviderMode } from "@/lib/infrastructure/storage/attachment-store";

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

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const owner = getAttachmentOwnerIds(body.transactionId, body.cashTransferId);
    const stagedKey = getString(body.stagedKey);
    const originalName = getString(body.originalName);
    const mimeType = getString(body.mimeType);
    const idempotencyKey = getString(body.idempotencyKey);
    const sizeBytes = body.sizeBytes;
    if (!stagedKey || !originalName || !mimeType || !idempotencyKey) {
      return NextResponse.json({ error: "Attachment finalization fields are required." }, { status: 400 });
    }
    if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes)) {
      return NextResponse.json({ error: "Attachment size is invalid." }, { status: 400 });
    }

    const state = await finalizeStagedAttachmentUpload({
      user: authResult.user,
      owner,
      stagedKey,
      originalName,
      mimeType,
      sizeBytes,
      idempotencyKey,
    });
    if (state?.error) return NextResponse.json({ error: state.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[AttachmentFinalize] Request failed:", error);
    return NextResponse.json({ error: "Could not finalize attachment." }, { status: 400 });
  }
}
