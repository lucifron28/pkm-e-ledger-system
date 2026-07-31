/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

function logResult(label, passed, details = "") {
  const icon = passed ? "✓" : "✗";
  const status = passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${icon} ${label}${details ? ` (${details})` : ""}`);
  return passed;
}

async function verifyReadiness() {
  console.log("=== PKM e-Ledger Pre-flight Verification ===\n");
  let overallPassed = true;

  const rootDir = path.join(__dirname, "..");
  const envPath = path.join(rootDir, ".env");

  // 1. Check .env file exists
  if (!fs.existsSync(envPath)) {
    logResult("Environment file (.env)", false, "File is missing. Create one based on .env.example.");
    overallPassed = false;
  } else {
    logResult("Environment file (.env)", true);

    const env = {};
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      if (line.trim().startsWith("#") || !line.trim()) return;
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        env[match[1]] = value.trim();
      }
    });

    // 2. Check DATABASE_URL & SQLite file
    const dbUrl = env.DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      logResult("DATABASE_URL check", false, "Missing DATABASE_URL");
      overallPassed = false;
    } else {
      let dbPath;
      if (dbUrl.startsWith("file:")) {
        const rawPath = dbUrl.replace(/^file:/, "");
        if (path.isAbsolute(rawPath)) {
          dbPath = rawPath;
        } else {
          dbPath = path.resolve(rootDir, "prisma", rawPath);
        }
      } else {
        dbPath = path.resolve(rootDir, "prisma", "dev.db");
      }

      if (!fs.existsSync(dbPath)) {
        logResult("SQLite database file existence", false, `File missing at ${dbPath}. Run prisma migrations.`);
        overallPassed = false;
      } else {
        try {
          fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
          logResult("SQLite database permissions", true, "Database file is readable and writable");
        } catch {
          logResult("SQLite database permissions", false, `Cannot read/write database file at ${dbPath}`);
          overallPassed = false;
        }

        // Check actual database connectivity via Prisma query
        const prisma = new PrismaClient({
          datasources: { db: { url: dbUrl.startsWith("file:") ? dbUrl : `file:${dbPath}` } },
        });
        try {
          await prisma.$queryRaw`SELECT 1`;
          logResult("SQLite database query connectivity", true, "Database query SELECT 1 executed successfully");
        } catch (dbErr) {
          logResult("SQLite database query connectivity", false, `Failed to query database: ${dbErr.message}`);
          overallPassed = false;
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }

  // 3. Check uploads directory permissions
  const uploadsDir = path.join(rootDir, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
      logResult("Uploads folder creation", true, "Created missing uploads directory");
    } catch (err) {
      logResult("Uploads folder creation", false, `Failed to create uploads folder: ${err.message}`);
      overallPassed = false;
    }
  } else {
    logResult("Uploads folder existence", true);
  }

  if (fs.existsSync(uploadsDir)) {
    const testFile = path.join(uploadsDir, ".write-test");
    try {
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      logResult("Uploads folder write permissions", true, "Folder is writable");
    } catch {
      logResult("Uploads folder write permissions", false, `No write permission inside uploads directory: ${uploadsDir}`);
      overallPassed = false;
    }
  }

  // 4. Verify Node Modules & Prisma client compilation
  try {
    execSync("npx prisma --version", { stdio: "ignore" });
    logResult("Prisma CLI availability", true);
  } catch {
    logResult("Prisma CLI availability", false, "Prisma is not installed. Run npm install.");
    overallPassed = false;
  }

  console.log("\n=============================================");
  if (overallPassed) {
    console.log("✓ ALL CHECKS PASSED. Codebase is ready for deployment.");
    if (require.main === module) process.exit(0);
    return true;
  } else {
    console.log("✗ VERIFICATION FAILED. Fix the issues listed above before deploying.");
    if (require.main === module) process.exit(1);
    return false;
  }
}

if (require.main === module) {
  verifyReadiness();
}

module.exports = { verifyReadiness };
