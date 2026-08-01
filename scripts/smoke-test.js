/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

async function runSmokeTest() {
  console.log("=== PKM e-Ledger Database Smoke Test ===");

  const rootDir = path.join(__dirname, "..");
  const tempSmokeDbPath = path.join(__dirname, "temp_smoke_test.db");
  const tempDbUrl = `file:${tempSmokeDbPath}`;

  const isIsolatedTest = process.env.USE_DEV_DB !== "true";
  if (isIsolatedTest) {
    process.env.DATABASE_URL = tempDbUrl;
    if (fs.existsSync(tempSmokeDbPath)) {
      try { fs.unlinkSync(tempSmokeDbPath); } catch { /* best effort */ }
    }
    // Prisma's Windows schema engine requires the SQLite file to exist before deploy.
    fs.writeFileSync(tempSmokeDbPath, Buffer.alloc(0));

    execSync(`npx prisma migrate deploy`, {
      cwd: rootDir,
      env: { ...process.env, DATABASE_URL: tempDbUrl },
      encoding: "utf8",
      stdio: "ignore",
    });

    // Run seed directly via tsx (prisma db seed re-loads .env and would override DATABASE_URL)
    execSync(`npx tsx prisma/seed.ts`, {
      cwd: rootDir,
      env: { ...process.env, DATABASE_URL: tempDbUrl },
      encoding: "utf8",
      stdio: "ignore",
    });
  }

  const prisma = new PrismaClient();

  try {
    const orgCount = await prisma.organization.count();
    const categoryCount = await prisma.transactionCategory.count();
    const userCount = await prisma.user.count();
    const termCount = await prisma.academicTerm.count();

    console.log(`✓ Organizations: ${orgCount}`);
    console.log(`✓ Categories: ${categoryCount}`);
    console.log(`✓ Users: ${userCount}`);
    console.log(`✓ Academic Terms: ${termCount}`);

    if (orgCount === 0 || categoryCount === 0 || userCount === 0 || termCount === 0) {
      throw new Error("Smoke test failed: Seed data missing or empty tables.");
    }

    const activeTerms = await prisma.academicTerm.findMany({ where: { active: true } });
    const orgActiveMap = new Map();
    for (const term of activeTerms) {
      if (orgActiveMap.has(term.organizationId)) {
        throw new Error(`Smoke test failed: Organization ${term.organizationId} has multiple active terms.`);
      }
      orgActiveMap.set(term.organizationId, term.id);
    }
    console.log(`✓ Single active term per organization validated (${activeTerms.length} active terms).`);

    const terms = await prisma.academicTerm.findMany({ select: { academicYear: true } });
    const ayPattern = /^\d{4}-\d{4}$/;
    for (const term of terms) {
      if (!ayPattern.test(term.academicYear)) {
        throw new Error(`Smoke test failed: Academic year "${term.academicYear}" is not in canonical YYYY-YYYY format.`);
      }
    }
    console.log(`✓ Canonical academic year format (YYYY-YYYY) validated for all terms.`);

    const categories = await prisma.transactionCategory.findMany();
    for (const cat of categories) {
      if (!cat.reportBucket) {
        throw new Error(`Smoke test failed: Category "${cat.name}" has missing reportBucket.`);
      }
    }
    console.log(`✓ Category report bucket configuration validated.`);

    const rolesInDb = new Set((await prisma.user.findMany({ select: { role: true } })).map((u) => u.role));
    const requiredRoles = ["TREASURER", "ADVISER", "AUDIT", "OFFICER", "MEMBER", "OSA"];
    for (const role of requiredRoles) {
      if (!rolesInDb.has(role)) {
        throw new Error(`Smoke test failed: Role "${role}" missing from seed users.`);
      }
    }
    console.log(`✓ All 6 system roles validated in seeded users.`);

    const users = await prisma.user.findMany({ select: { username: true } });
    const usernames = users.map((u) => u.username);
    const uniqueUsernames = new Set(usernames);
    if (usernames.length !== uniqueUsernames.size) {
      throw new Error("Smoke test failed: Duplicate usernames detected in seeded users.");
    }
    console.log(`✓ Username uniqueness validated (${uniqueUsernames.size} unique users).`);

    console.log("=== SMOKE TEST PASSED ===");
  } catch (error) {
    console.error("❌ SMOKE TEST FAILED:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    if (isIsolatedTest && fs.existsSync(tempSmokeDbPath)) {
      try { fs.unlinkSync(tempSmokeDbPath); } catch { /* best effort */ }
    }
  }
}

runSmokeTest();
