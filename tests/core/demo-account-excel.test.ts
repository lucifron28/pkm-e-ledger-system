import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import ExcelJS from "exceljs";
import { buildDemoAccountsExcelBuffer } from "../../lib/reports/renderers/demo-account-excel-renderer";

test("Demo account Excel export: includes seeded credentials, access guide, and formulas", async () => {
  const buffer = await buildDemoAccountsExcelBuffer([
    {
      fullName: "Demo Treasurer User",
      username: "demo_treasurer_synthetic-org",
      role: Role.TREASURER,
      organizationName: "Synthetic Organization",
      active: true,
    },
    {
      fullName: "Demo OSA User",
      username: "demo_osa",
      role: Role.OSA,
      organizationName: null,
      active: true,
    },
  ]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer as unknown as ArrayBuffer);

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["DEMO ACCOUNTS", "ACCESS GUIDE"]);
  const accounts = workbook.getWorksheet("DEMO ACCOUNTS")!;
  assert.equal(accounts.getCell("A5").text, "Organization");
  assert.equal(accounts.getCell("C6").text, "demo_treasurer_synthetic-org");
  assert.equal(accounts.getCell("E6").text, "password");
  assert.equal(accounts.getCell("H6").text, "Active");
  assert.equal(accounts.getCell("G7").text, "All organizations");

  const guide = workbook.getWorksheet("ACCESS GUIDE")!;
  const totalFormula = guide.getCell("B6").value;
  assert.ok(totalFormula && typeof totalFormula === "object" && "formula" in totalFormula);
  assert.equal((totalFormula as { result: number }).result, 2);
});

test("Demo account Excel export: sanitizes formula-like account values", async () => {
  const buffer = await buildDemoAccountsExcelBuffer([
    {
      fullName: "=Synthetic Name",
      username: "demo_treasurer_formula-test",
      role: Role.TREASURER,
      organizationName: "+Synthetic Organization",
      active: true,
    },
  ]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer as unknown as ArrayBuffer);
  const accounts = workbook.getWorksheet("DEMO ACCOUNTS")!;

  assert.equal(accounts.getCell("A6").value, "'+Synthetic Organization");
  assert.equal(accounts.getCell("D6").value, "'=Synthetic Name");
});
