import { NextRequest, NextResponse } from "next/server";
import { getSession, SessionUser } from "@/lib/auth/session";
import { isManagementRole } from "@/lib/auth/rbac";
import { getReportPackageForUser } from "@/lib/data/reports";
import { createAuditLog } from "@/lib/data/audit-log";
import { buildReportPdfBuffer } from "@/lib/reports/renderers/pdf-report-renderer";
import { AuditAction } from "@prisma/client";

import { validateRouteAuth } from "@/lib/auth/require-auth";
import { MANAGEMENT_ROLES } from "@/lib/auth/rbac";

export async function handleReportPdfExportRequest(
  termId: string,
  sessionUser?: SessionUser | null
): Promise<NextResponse> {
  const authResult = await validateRouteAuth(MANAGEMENT_ROLES, undefined, sessionUser);
  if (authResult.errorResponse) {
    return new NextResponse(authResult.errorResponse.message, { status: authResult.errorResponse.status });
  }
  const user = authResult.user;
  if (!user.organizationId) {
    return new NextResponse("Access denied. Organization assignment required.", { status: 403 });
  }

  const report = await getReportPackageForUser(user, termId);
  if (!report || report.organizationId !== user.organizationId) {
    return new NextResponse("Report term not found or access denied.", { status: 404 });
  }
  try {
    const pdfBuffer = await buildReportPdfBuffer(report);

    await createAuditLog({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      action: AuditAction.GENERATED_REPORT,
      entityType: "ReportPackage",
      entityId: termId,
      metadata: { format: "PDF", termId, academicYear: report.academicYear, semester: report.semester },
      throwOnError: true,
    });

    const safeSlug = report.organizationSlug.replace(/[^a-z0-9_-]/gi, "_");
    const safeAY = report.academicYear.replace(/[^a-z0-9_-]/gi, "_");
    const fileName = `Financial_Report_${safeSlug}_${safeAY}_${report.semester}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return new NextResponse("Failed to export report.", { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ termId: string }> }
) {
  const sessionUser = await getSession();
  const { termId } = await params;
  return handleReportPdfExportRequest(termId, sessionUser);
}
