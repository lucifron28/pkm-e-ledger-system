import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSession();
  if (!sessionUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      transaction: { select: { organizationId: true } },
    },
  });

  if (!attachment) {
    return new NextResponse("Attachment not found", { status: 404 });
  }

  if (sessionUser.role !== "OSA" && sessionUser.organizationId !== attachment.transaction.organizationId) {
    return new NextResponse("Access denied", { status: 403 });
  }

  if (!existsSync(attachment.storagePath)) {
    return new NextResponse("File not found on disk", { status: 404 });
  }

  try {
    const fileBuffer = await readFile(attachment.storagePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${attachment.originalName}"`,
        "Content-Length": attachment.sizeBytes.toString(),
      },
    });
  } catch {
    return new NextResponse("Error reading file", { status: 500 });
  }
}
