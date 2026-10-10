import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import path from "path";
import { handleUpload } from "@vercel/blob/client";
import type { HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth/session";
import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";
import {
  defaultAttachmentStorageService,
  getBlobAccess,
  isVercelBlobConfigured,
} from "@/lib/infrastructure/storage/attachment-store";
import { validateAndReadAttachmentFile } from "@/lib/domain/attachments";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, session);
  if (authResult.errorResponse) {
    return new NextResponse(authResult.errorResponse.message, { status: authResult.errorResponse.status });
  }

  const isBlob = isVercelBlobConfigured();
  return NextResponse.json({
    isBlobConfigured: isBlob,
    blobAccess: getBlobAccess(),
    organizationId: authResult.user.organizationId,
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
    allowedExtensions: ["jpg", "jpeg", "png", "pdf"],
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, session);
  if (authResult.errorResponse) {
    return new NextResponse(authResult.errorResponse.message, { status: authResult.errorResponse.status });
  }
  const user = authResult.user;
  if (!user.organizationId) {
    return NextResponse.json({ error: "User is not assigned to an organization." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";

  // 1. Fallback / direct multipart upload route (used when Blob storage is not configured, e.g. local dev & test)
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File) || file.size <= 0) {
        return NextResponse.json({ error: "File is required." }, { status: 400 });
      }

      const validation = await validateAndReadAttachmentFile(file);
      if (!validation.success) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const validated = validation.data;

      const staged = await defaultAttachmentStorageService.stageUpload(
        validated.buffer,
        validated.originalName,
        validated.mimeType
      );
      const committed = await defaultAttachmentStorageService.commitUpload(staged.stageId, staged.extension);

      return NextResponse.json({
        success: true,
        storageKey: committed.storageKey,
        originalName: validated.originalName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
      });
    } catch (err: unknown) {
      console.error("[AttachmentUploadRoute] Multipart upload error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to stage attachment." },
        { status: 500 }
      );
    }
  }

  // 2. Direct client upload route using @vercel/blob/client handleUpload
  if (!isVercelBlobConfigured()) {
    return NextResponse.json(
      { error: "Vercel Blob storage is not configured for direct upload." },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        const ext = path.extname(pathname).replace(/^\./, "").toLowerCase();
        if (!["jpg", "jpeg", "png", "pdf"].includes(ext)) {
          throw new Error("Invalid attachment extension. Allowed: jpg, jpeg, png, pdf.");
        }
        const expectedPrefix = `attachments/${user.organizationId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Invalid upload path: organization scope mismatch.");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            userId: user.id,
            organizationId: user.organizationId,
            pathname,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Direct client upload completed successfully into Blob store
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: unknown) {
    console.error("[AttachmentUploadRoute] HandleUpload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate client upload token." },
      { status: 400 }
    );
  }
}
