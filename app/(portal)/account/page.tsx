import { requireUser } from "@/lib/auth/require-auth";
import { logoutAction } from "@/lib/actions/logout";
import { Button, ButtonLink, PageHeader, Panel } from "@/components/ui/patterns";
import { ProfileForm } from "@/components/profile-form";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Account settings"
        description="Review profile, access role, organization assignment, and session controls."
      />

      <Panel
        title="Profile details"
        description="Update the name and username shown in the portal and audit records."
        actions={<span className="ui-status-chip ui-status-chip-brand">{user.role}</span>}
      >
        <ProfileForm initialFullName={user.fullName} initialUsername={user.username} />
        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
          <div className="grid gap-2 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="ui-label mb-0">Assigned role</dt>
            <dd className="text-sm font-semibold text-slate-900 sm:col-span-2">{user.role}</dd>
          </div>
          <div className="grid gap-2 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="ui-label mb-0">Organization</dt>
            <dd className="text-sm font-semibold text-slate-900 sm:col-span-2">{user.organizationName || "Office of Student Affairs (OSA)"}</dd>
          </div>
          <div className="grid gap-2 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="ui-label mb-0">Account status</dt>
            <dd className="sm:col-span-2"><span className="ui-status-chip ui-status-chip-success">Active</span></dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Security and session" description="Password changes apply to your next sign-in. Signing out ends this session.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/change-password">Change password</ButtonLink>
          <form action={logoutAction}>
            <Button type="submit" variant="danger">Log out</Button>
          </form>
        </div>
      </Panel>
    </div>
  );
}
