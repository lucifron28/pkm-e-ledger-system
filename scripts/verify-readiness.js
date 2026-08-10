/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const { PrismaLibSQL } = require("@prisma/adapter-libsql");

function logResult(label, passed, details = "") {
  const icon = passed ? "PASS" : "FAIL";
  console.log(`[${icon}] ${label}${details ? ` (${details})` : ""}`);
  return passed;
}

function readEnvFile(envPath) {
  const values = {};
  if (!fs.existsSync(envPath)) return values;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    if (line.trim().startsWith("#") || !line.trim()) return;
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) return;
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    values[match[1]] = value.trim();
  });
  return values;
}

function resolveLocalDatabasePath(rootDir, dbUrl) {
  const rawPath = dbUrl.replace(/^file:/, "");
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(rootDir, "prisma", rawPath);
}

async function verifyReadiness() {
  console.log("=== PKM e-Ledger Pre-flight Verification ===\n");
  let overallPassed = true;
  const rootDir = path.join(__dirname, "..");
  const envPath = path.join(rootDir, ".env");
  const envFileExists = fs.existsSync(envPath);
  overallPassed = logResult(
    "Environment file (.env)",
    envFileExists,
    envFileExists ? "Loaded without displaying values" : "Create one based on .env.example",
  ) && overallPassed;
  const env = { ...readEnvFile(envPath), ...process.env };

  const dbUrl = env.DATABASE_URL;
  const tursoUrl = env.TURSO_DATABASE_URL?.trim();
  const tursoToken = env.TURSO_AUTH_TOKEN?.trim();
  const hasTursoUrl = Boolean(tursoUrl);
  const hasTursoToken = Boolean(tursoToken);
  const isTursoMode = hasTursoUrl && hasTursoToken;
  const isVercel = env.VERCEL === "1";

  if (hasTursoUrl !== hasTursoToken) {
    logResult("Turso configuration", false, "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together");
    overallPassed = false;
  } else if (isVercel && !isTursoMode) {
    logResult("Turso configuration", false, "Vercel runtime requires Turso credentials");
    overallPassed = false;
  } else {
    logResult("Database runtime mode", true, isTursoMode ? "Turso/libSQL" : "local SQLite");
  }

  if (!dbUrl) {
    logResult("DATABASE_URL check", false, "Missing DATABASE_URL required by Prisma schema");
    overallPassed = false;
  } else {
    logResult("DATABASE_URL check", true, "Configured");
  }

  const deploymentMode = isVercel || env.NODE_ENV === "production";
  if (deploymentMode && !env.DEMO_PASSWORD?.trim()) {
    logResult("DEMO_PASSWORD check", false, "Required in production/deployment mode");
    overallPassed = false;
  } else {
    logResult("DEMO_PASSWORD check", true, deploymentMode ? "Configured without exposing value" : "Not required for local development");
  }

  const storageProvider = env.ATTACHMENT_STORAGE_PROVIDER?.trim() || "local";
  if (storageProvider !== "local" && storageProvider !== "vercel-blob") {
    logResult("Attachment storage provider", false, `Unsupported provider: ${storageProvider}`);
    overallPassed = false;
  } else if (isVercel && storageProvider !== "vercel-blob") {
    logResult("Attachment storage provider", false, "Vercel runtime requires private Vercel Blob");
    overallPassed = false;
  } else if (storageProvider === "vercel-blob" && !env.BLOB_READ_WRITE_TOKEN?.trim()) {
    logResult("Attachment storage provider", false, "BLOB_READ_WRITE_TOKEN is required for private Blob storage");
    overallPassed = false;
  } else {
    logResult("Attachment storage provider", true, storageProvider === "vercel-blob" ? "private Vercel Blob" : "local filesystem");
  }

  let prisma;
  try {
    if (isTursoMode) {
      prisma = new PrismaClient({
        adapter: new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken }, { timestampFormat: "unixepoch-ms" }),
      });
      await prisma.$queryRaw`SELECT 1`;
      logResult("Turso database query connectivity", true, "SELECT 1 executed successfully");
    } else if (dbUrl?.startsWith("file:")) {
      const dbPath = resolveLocalDatabasePath(rootDir, dbUrl);
      if (!fs.existsSync(dbPath)) {
        logResult("SQLite database file existence", false, `File missing at ${dbPath}. Run migrations.`);
        overallPassed = false;
      } else {
        try {
          fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
          logResult("SQLite database permissions", true, "Readable and writable");
        } catch {
          logResult("SQLite database permissions", false, `Cannot read/write database file at ${dbPath}`);
          overallPassed = false;
        }
        prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
        await prisma.$queryRaw`SELECT 1`;
        logResult("SQLite database query connectivity", true, "SELECT 1 executed successfully");
      }
    } else {
      logResult("Database URL format", false, "DATABASE_URL must be a local file URL when Turso is not configured");
      overallPassed = false;
    }
  } catch (error) {
    logResult("Database query connectivity", false, `Database query failed: ${error.message}`);
    overallPassed = false;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  }

  if (storageProvider === "local" && !isVercel) {
    const uploadsDir = path.join(rootDir, "uploads");
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
      const testFile = path.join(uploadsDir, ".write-test");
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
      logResult("Local uploads storage", true, "Directory is writable");
    } catch (error) {
      logResult("Local uploads storage", false, `Cannot write uploads directory: ${error.message}`);
      overallPassed = false;
    }
  } else {
    logResult("Local uploads storage", true, "Skipped; private Blob provider is active");
  }

  try {
    execSync("npx prisma --version", { cwd: rootDir, stdio: "ignore" });
    logResult("Prisma CLI availability", true);
  } catch {
    logResult("Prisma CLI availability", false, "Prisma is not installed. Run npm ci.");
    overallPassed = false;
  }

  console.log("\n=============================================");
  if (overallPassed) {
    console.log("ALL CHECKS PASSED. Codebase is ready for deployment.");
    if (require.main === module) process.exit(0);
    return true;
  }
  console.log("VERIFICATION FAILED. Fix listed issues before deploying.");
  if (require.main === module) process.exit(1);
  return false;
}

if (require.main === module) verifyReadiness();

module.exports = { verifyReadiness };
