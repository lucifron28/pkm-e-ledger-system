import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const shouldUseTurso =
    process.env.VERCEL === "1" || databaseUrl?.startsWith("libsql://");

  if (shouldUseTurso && tursoUrl && tursoAuthToken) {
    const adapter = new PrismaLibSQL(
      { url: tursoUrl, authToken: tursoAuthToken },
      { timestampFormat: "unixepoch-ms" }
    );
    return new PrismaClient({ adapter });
  }

  if (shouldUseTurso) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required on Vercel."
    );
  }

  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
