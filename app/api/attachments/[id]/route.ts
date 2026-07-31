import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession, SessionUser } from "@/lib/auth/session";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { isManagementRole } from "@/lib/auth/rbac";

export async function handleAttachmentDownloadRequest(
  attachmentId: string,
  sessionUser: SessionUser | null,
  customUploadsRoot?: string
): Promise<NextResponse> {
  if (!sessionUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isManagementRole(sessionUser.role) || !sessionUser.organizationId) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      transaction: { select: { organizationId: true, deletedAt: true } },
    },
  });

  if (!attachment) {
    return new NextResponse("Attachment not found", { status: 404 });
  }

  if (
    sessionUser.organizationId !== attachment.transaction.organizationId ||
    attachment.transaction.deletedAt
  ) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const uploadsRoot = path.resolve(customUploadsRoot || path.join(process.cwd(), "uploads"));
  const storagePath = path.resolve(attachment.storagePath);
  if (!storagePath.startsWith(`${uploadsRoot}${path.sep}`) || !existsSync(storagePath)) {
    return new NextResponse("File not found on disk", { status: 404 });
  }

  try {
    const fileBuffer = await readFile(storagePath);
    const safeFileName = attachment.originalName.replace(/["\r\n\\/]/g, "_");
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "Content-Length": attachment.sizeBytes.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
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
