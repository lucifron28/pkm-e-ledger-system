import { validatePasswordLength } from "../domain/password-policy";

export const LOCAL_DEMO_PASSWORD_FALLBACK = "local-demo-only-password";

type DemoPasswordEnvironment = {
  DEMO_PASSWORD?: string;
  NODE_ENV?: string;
  VERCEL?: string;
};

export function getDemoPassword(environment: DemoPasswordEnvironment = process.env as DemoPasswordEnvironment): string {
  const configuredPassword = environment.DEMO_PASSWORD;
  const isDeployment = environment.VERCEL === "1" || environment.NODE_ENV === "production";

  if (!configuredPassword) {
    if (isDeployment) {
      throw new Error("DEMO_PASSWORD is required when seeding a deployment or production environment.");
    }
    return LOCAL_DEMO_PASSWORD_FALLBACK;
  }

  const validation = validatePasswordLength(configuredPassword);
  if (!validation.valid) throw new Error(`DEMO_PASSWORD is invalid: ${validation.message}`);
  return configuredPassword;
}
