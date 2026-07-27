/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

async function runSmokeTest() {
  console.log("=== PKM e-Ledger Database Smoke Test ===");
  const prisma = new PrismaClient();

  try {
    // 1. Verify connection and table counts
    const orgCount = await prisma.organization.count();
    const categoryCount = await prisma.transactionCategory.count();
    const userCount = await prisma.user.count();
    const termCount = await prisma.academicTerm.count();

    console.log(`✓ Organizations: ${orgCount}`);
    console.log(`✓ Categories: ${categoryCount}`);
    console.log(`✓ Users: ${userCount}`);
    console.log(`✓ Academic Terms: ${termCount}`);

    if (orgCount === 0 || categoryCount === 0 || userCount === 0) {
      throw new Error("Smoke test failed: Seed data missing or empty tables.");
    }

    // 2. Verify specific seed data integrity
    const osaUser = await prisma.user.findUnique({
      where: { username: "demo_osa" },
    });

    if (!osaUser || osaUser.role !== "OSA") {
      throw new Error("Smoke test failed: Default OSA demo user not found.");
    }

    console.log("✓ Default OSA user validated.");
    console.log("=== SMOKE TEST PASSED ===");
  } catch (error) {
    console.error("❌ SMOKE TEST FAILED:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSmokeTest();
