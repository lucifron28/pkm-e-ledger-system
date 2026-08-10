import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

export type DatabaseRuntimeMode = "local" | "turso";

export type DatabaseEnvironment = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  VERCEL?: string;
};

export function getDatabaseRuntimeMode(environment: DatabaseEnvironment = process.env as DatabaseEnvironment): DatabaseRuntimeMode {
  const hasTursoUrl = Boolean(environment.TURSO_DATABASE_URL?.trim());
  const hasTursoToken = Boolean(environment.TURSO_AUTH_TOKEN?.trim());

  if (hasTursoUrl !== hasTursoToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together.");
  }

  if (environment.VERCEL === "1" && !hasTursoUrl) {
    throw new Error("Turso database configuration is required on Vercel.");
  }

  return hasTursoUrl ? "turso" : "local";
}

export function createPrismaClient(environment: DatabaseEnvironment = process.env as DatabaseEnvironment): PrismaClient {
  const mode = getDatabaseRuntimeMode(environment);

  if (mode === "turso") {
    const url = environment.TURSO_DATABASE_URL;
    const authToken = environment.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error("Turso database configuration is incomplete.");

    return new PrismaClient({
      adapter: new PrismaLibSQL({ url, authToken }, { timestampFormat: "unixepoch-ms" }),
    });
  }

  return new PrismaClient();
}
