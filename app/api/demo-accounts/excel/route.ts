import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, SessionUser } from "@/lib/auth/session";
import { validateRouteAuth } from "@/lib/auth/require-auth";
import { listSeededDemoAccounts } from "@/lib/data/demo-accounts";
import {
  buildDemoAccountsExcelBuffer,
  DEMO_ACCOUNT_EXCEL_CONTENT_TYPE,
} from "@/lib/reports/renderers/demo-account-excel-renderer";

export const dynamic = "force-dynamic";

export async function handleDemoAccountsExcelExportRequest(
  sessionUser?: SessionUser | null
): Promise<NextResponse> {
  const authResult = await validateRouteAuth([Role.OSA], undefined, sessionUser);
  if (authResult.errorResponse) {
    return new NextResponse(authResult.errorResponse.message, { status: authResult.errorResponse.status });
  }

  try {
    const accounts = await listSeededDemoAccounts();
    const excelBuffer = await buildDemoAccountsExcelBuffer(accounts);

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type": DEMO_ACCOUNT_EXCEL_CONTENT_TYPE,
        "Content-Disposition": "attachment; filename=PKM_Demo_Accounts.xlsx",
        "Content-Length": excelBuffer.length.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Demo account Excel export error:", error);
    return new NextResponse("Failed to export demo accounts.", { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return handleDemoAccountsExcelExportRequest(await getSession());
}
