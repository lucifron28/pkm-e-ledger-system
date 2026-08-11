import ExcelJS from "exceljs";
import { Role } from "@prisma/client";
import {
  DEMO_ACCOUNT_DEFAULT_PASSWORD,
  DemoAccountExportRow,
  getDemoAccountAccessLabel,
} from "@/lib/domain/demo-accounts";
import { sanitizeExcelCellString } from "@/lib/reports/renderers/excel-report-renderer";

export const DEMO_ACCOUNT_EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const thinBorder = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
} as ExcelJS.Borders;

const managementRoles = new Set<Role>([Role.TREASURER, Role.ADVISER, Role.AUDIT]);

function setFormula(cell: ExcelJS.Cell, formula: string, result: number): void {
  cell.value = { formula, result };
}

function configureSheet(sheet: ExcelJS.Worksheet, orientation: "portrait" | "landscape"): void {
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 5 }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };
  sheet.headerFooter.oddFooter = "Page &P of &N";
}

function styleHeader(row: ExcelJS.Row, endColumn: number, color = "FF004AAD"): void {
  for (let column = 1; column <= endColumn; column += 1) {
    const cell = row.getCell(column);
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  }
  row.height = 30;
}

function styleRow(row: ExcelJS.Row, endColumn: number): void {
  for (let column = 1; column <= endColumn; column += 1) {
    row.getCell(column).border = thinBorder;
  }
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 32;
}

function addHeading(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  note: string,
  endColumn: number
): void {
  const headingRows = [title, subtitle, note];
  headingRows.forEach((value, index) => {
    const row = sheet.addRow([value]);
    sheet.mergeCells(row.number, 1, row.number, endColumn);
    const cell = row.getCell(1);
    cell.value = value;
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.font = {
      name: "Calibri",
      size: index === 0 ? 14 : 10,
      bold: index === 0,
      italic: index === 1,
      color: { argb: index === 0 ? "FFFFFFFF" : index === 2 ? "FF92400E" : "FF475569" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index === 0 ? "FF123B63" : index === 2 ? "FFFEF3C7" : "FFEAF2FB" },
    };
    row.height = index === 0 ? 24 : 21;
  });
  sheet.addRow([]).height = 8;
}

function accountScope(account: DemoAccountExportRow): string {
  return account.role === Role.OSA ? "All organizations" : account.organizationName || "Assigned organization";
}

export async function buildDemoAccountsExcelBuffer(accounts: DemoAccountExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PKM e-Ledger System";
  workbook.created = new Date();

  const accountSheet = workbook.addWorksheet("DEMO ACCOUNTS");
  accountSheet.columns = [
    { width: 38 },
    { width: 14 },
    { width: 70 },
    { width: 24 },
    { width: 16 },
    { width: 62 },
    { width: 38 },
    { width: 14 },
  ];
  configureSheet(accountSheet, "landscape");
  addHeading(
    accountSheet,
    "PKM e-Ledger Demo Account Directory",
    "Fictional seeded accounts for remote demo handoff",
    "Default seed password is included. Users must change it before production use.",
    8
  );

  const headerRow = accountSheet.addRow([
    "Organization",
    "Role",
    "Username",
    "Full Name",
    "Password",
    "Access",
    "Scope",
    "Account Status",
  ]);
  styleHeader(headerRow, 8);

  const dataStart = headerRow.number + 1;
  for (const account of accounts) {
    const row = accountSheet.addRow([
      sanitizeExcelCellString(account.organizationName || "Office of Student Affairs"),
      sanitizeExcelCellString(account.role),
      sanitizeExcelCellString(account.username),
      sanitizeExcelCellString(account.fullName),
      DEMO_ACCOUNT_DEFAULT_PASSWORD,
      sanitizeExcelCellString(getDemoAccountAccessLabel(account.role)),
      sanitizeExcelCellString(accountScope(account)),
      account.active ? "Active" : "Inactive",
    ]);
    styleRow(row, 8);
    row.getCell(2).font = { name: "Calibri", bold: true, color: { argb: "FF123B63" } };
    row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(5).font = { name: "Calibri", color: { argb: "FF7C2D12" } };
    row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(6).font = { name: "Calibri", color: { argb: "FF475569" } };
    if (managementRoles.has(account.role)) {
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
    } else if (account.role === Role.OSA) {
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    } else {
      row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FB" } };
    }
  }

  if (accounts.length === 0) {
    const emptyRow = accountSheet.addRow(["", "", "", "", "", "No seeded demo accounts found.", "", ""]);
    styleRow(emptyRow, 8);
  }

  const dataEnd = accountSheet.rowCount;
  accountSheet.autoFilter = { from: `A${headerRow.number}`, to: `H${dataEnd}` };
  accountSheet.pageSetup.printArea = `A1:H${dataEnd}`;

  const guide = workbook.addWorksheet("ACCESS GUIDE");
  guide.columns = [{ width: 28 }, { width: 16 }, { width: 70 }, { width: 32 }];
  configureSheet(guide, "landscape");
  addHeading(
    guide,
    "Demo Account Access Guide",
    "Fictional seeded accounts only",
    "Password shown in DEMO ACCOUNTS is the default seed password and may be changed by the user.",
    4
  );

  const metricHeader = guide.addRow(["Metric", "Value"]);
  styleHeader(metricHeader, 2);
  const metrics: Array<[string, string, number]> = [
    ["Total seeded accounts", `COUNTA('DEMO ACCOUNTS'!$C$${dataStart}:$C$${dataEnd})`, accounts.length],
    ["Organization-scoped accounts", `COUNTIF('DEMO ACCOUNTS'!$B$${dataStart}:$B$${dataEnd},"<>OSA")`, accounts.filter((account) => account.role !== Role.OSA).length],
    ["OSA monitoring accounts", `COUNTIF('DEMO ACCOUNTS'!$B$${dataStart}:$B$${dataEnd},"OSA")`, accounts.filter((account) => account.role === Role.OSA).length],
  ];
  for (const [label, formula, result] of metrics) {
    const row = guide.addRow([label, null]);
    row.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    setFormula(row.getCell(2), formula, result);
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    styleRow(row, 2);
  }

  guide.addRow([]).height = 8;
  const roleHeader = guide.addRow(["Role", "Count", "Access", "Scope"]);
  styleHeader(roleHeader, 4);
  const roleOrder: Role[] = [Role.TREASURER, Role.ADVISER, Role.AUDIT, Role.OFFICER, Role.MEMBER, Role.OSA];
  for (const role of roleOrder) {
    const row = guide.addRow([
      role,
      null,
      getDemoAccountAccessLabel(role),
      role === Role.OSA ? "All organizations" : "One assigned organization",
    ]);
    setFormula(
      row.getCell(2),
      `COUNTIF('DEMO ACCOUNTS'!$B$${dataStart}:$B$${dataEnd},A${row.number})`,
      accounts.filter((account) => account.role === role).length
    );
    styleRow(row, 4);
    row.getCell(1).font = { name: "Calibri", bold: true, color: { argb: role === Role.OSA ? "FF92400E" : "FF123B63" } };
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(3).font = { name: "Calibri", color: { argb: "FF475569" } };
  }
  guide.pageSetup.printArea = `A1:D${guide.rowCount}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
