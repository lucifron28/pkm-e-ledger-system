import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession, SessionUser } from "@/lib/auth/session";

import { createAttachmentStorageService } from "@/lib/infrastructure/storage/attachment-store";

import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";

export const runtime = "nodejs";

export async function handleAttachmentDownloadRequest(
  attachmentId: string,
  sessionUser: SessionUser | null,
  customUploadsRoot?: string
): Promise<NextResponse> {
  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, sessionUser);
  if (authResult.errorResponse) {
    return new NextResponse(authResult.errorResponse.message, { status: authResult.errorResponse.status });
  }
  const user = authResult.user;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      transaction: { select: { organizationId: true, deletedAt: true } },
      cashTransfer: { select: { organizationId: true, deletedAt: true } },
    },
  });

  if (!attachment) {
    return new NextResponse("Attachment not found", { status: 404 });
  }

  const ownerOrgId = attachment.transaction?.organizationId || attachment.cashTransfer?.organizationId;
  const isDeleted = Boolean(attachment.transaction?.deletedAt || attachment.cashTransfer?.deletedAt);

  if (!ownerOrgId || user.organizationId !== ownerOrgId || isDeleted) {
    return new NextResponse("Attachment not found", { status: 404 });
  }

  const storageService = createAttachmentStorageService(customUploadsRoot);
  let fileBuffer: Uint8Array;
  try {
    const stored = await storageService.readActiveFile(attachment.storageKey);
    if (!stored) return new NextResponse("File not found", { status: 404 });
    fileBuffer = stored.buffer;
    if (fileBuffer.length !== attachment.sizeBytes) {
      console.warn(
        `[AttachmentDownload] Stored size mismatch for attachment ${attachment.id}: metadata=${attachment.sizeBytes}, actual=${fileBuffer.length}`
      );
    }
    const safeFileName = attachment.originalName.replace(/["\r\n\\/]/g, "_");
    return new NextResponse(Buffer.from(fileBuffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[AttachmentDownload] Storage read failed:", error);
    return new NextResponse("Error reading file", { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSession();
  const { id } = await params;
  return handleAttachmentDownloadRequest(id, sessionUser);
}
