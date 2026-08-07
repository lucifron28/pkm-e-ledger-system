import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const ROOT_DIR = path.resolve(__dirname, "../..");
const tempDir = path.join(__dirname, "temp_seed_test");
const dbPath = path.join(tempDir, "seed.db");
const dbUrl = `file:${dbPath}`;

function runNpx(args: string[]): void {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  execSync(`${command} ${args.join(" ")}`, {
    cwd: ROOT_DIR,
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("Seed Integration: two runs stay limited to approved organizations", async () => {
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.alloc(0));

  runNpx(["prisma", "migrate", "deploy"]);
  runNpx(["tsx", "prisma/seed.ts"]);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const approvedOrganizations = await prisma.organization.findMany({ orderBy: { slug: "asc" } });
    assert.equal(approvedOrganizations.length, 14);
    const activeTermIdsBeforeSecondRun = (await prisma.academicTerm.findMany({ select: { id: true, active: true }, orderBy: { id: "asc" } }))
      .filter((term) => term.active)
      .map((term) => term.id);

    const supplies = await prisma.transactionCategory.findUnique({ where: { name_type: { name: "Supplies", type: "EXPENSE" } } });
    assert.ok(supplies);
    await prisma.transactionCategory.update({ where: { id: supplies.id }, data: { active: false } });
    const unrelated = await prisma.organization.create({
      data: { name: "Unrelated Fictional Organization", slug: "unrelated-fictional", active: false },
    });

    runNpx(["tsx", "prisma/seed.ts"]);

    const unrelatedAfter = await prisma.organization.findUnique({ where: { id: unrelated.id } });
    assert.equal(unrelatedAfter?.active, false);
    assert.equal(await prisma.user.count({ where: { organizationId: unrelated.id } }), 0);
    assert.equal(await prisma.academicTerm.count({ where: { organizationId: unrelated.id } }), 0);
    const activeTermIdsAfterSecondRun = (await prisma.academicTerm.findMany({ select: { id: true, active: true }, orderBy: { id: "asc" } }))
      .filter((term) => term.active)
      .map((term) => term.id);
    assert.deepEqual(activeTermIdsAfterSecondRun, activeTermIdsBeforeSecondRun);
    assert.equal((await prisma.transactionCategory.findUnique({ where: { id: supplies.id } }))?.active, false);
    assert.equal(await prisma.organization.count(), 15);
    assert.equal(await prisma.user.count({ where: { username: "demo_osa" } }), 1);
  } finally {
    await prisma.$disconnect();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
