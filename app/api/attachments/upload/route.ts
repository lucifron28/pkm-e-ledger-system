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
import { validateAndReadAttachmentFile, validateAttachmentMetadata } from "@/lib/domain/attachments";
import { recordUploadAuthorization } from "@/lib/infrastructure/storage/attachment-verification";

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
  const organizationId = user.organizationId;

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
      const storageKey = `${staged.stageId}.${staged.extension}`;
      await recordUploadAuthorization({
        uploadId: staged.stageId,
        userId: user.id,
        organizationId: user.organizationId,
        storageKey,
        originalName: validated.originalName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
      });

      return NextResponse.json({
        success: true,
        storageKey,
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
      onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
        let upload: {
          uploadId: string;
          originalName: string;
          mimeType: string;
          sizeBytes: number;
        };
        try {
          upload = JSON.parse(clientPayload || "") as typeof upload;
        } catch {
          throw new Error("Upload metadata is missing or invalid.");
        }

        if (
          typeof upload.uploadId !== "string" ||
          typeof upload.originalName !== "string" ||
          typeof upload.mimeType !== "string" ||
          !Number.isSafeInteger(upload.sizeBytes) ||
          upload.sizeBytes <= 0
        ) {
          throw new Error("Upload metadata is incomplete.");
        }
        const ext = path.extname(upload.originalName).replace(/^\./, "").toLowerCase();
        const metadataError = validateAttachmentMetadata(
          upload.originalName,
          upload.mimeType,
          upload.sizeBytes
        );
        if (metadataError || !["jpg", "jpeg", "png", "pdf"].includes(ext)) {
          throw new Error(metadataError || "Invalid attachment extension.");
        }
        if (!/^[a-f0-9-]{36}$/i.test(upload.uploadId)) {
          throw new Error("Invalid upload identifier.");
        }

        const authorizedPath = `attachments/${organizationId}/${upload.uploadId}.${ext}`;
        if (pathname !== authorizedPath) {
          throw new Error("Upload path does not match the authorized file reference.");
        }

        await recordUploadAuthorization({
          uploadId: upload.uploadId,
          userId: user.id,
          organizationId,
          storageKey: authorizedPath,
          originalName: upload.originalName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
        });

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            userId: user.id,
            organizationId,
            pathname: authorizedPath,
            uploadId: upload.uploadId,
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
