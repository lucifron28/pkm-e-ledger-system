import { requireUser } from "@/lib/auth/require-auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PublicShell } from "@/components/ui/public-shell";
import { StatusPanel } from "@/components/ui/patterns";

export default async function ChangePasswordPage() {
  const user = await requireUser(true);

  return (
    <PublicShell
      title="Change account password"
      subtitle="Use a private password that you do not reuse for another account."
    >
      {user.mustChangePassword && (
        <StatusPanel title="Password update required" tone="warning">
          Your account requires a password update before portal features become available.
        </StatusPanel>
      )}
      <div className={user.mustChangePassword ? "mt-5" : ""}>
        <ChangePasswordForm />
      </div>
    </PublicShell>
  );
}
