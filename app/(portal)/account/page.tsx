import { requireUser } from "@/lib/auth/require-auth";
import { logoutAction } from "@/lib/actions/logout";
import { Button, ButtonLink, PageHeader, Panel } from "@/components/ui/patterns";

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
        actions={<span className="ui-status-chip ui-status-chip-brand">{user.role}</span>}
      >
        <dl className="divide-y divide-slate-100">
          <div className="grid gap-2 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="ui-label mb-0">Full name</dt>
            <dd className="text-sm font-semibold text-slate-900 sm:col-span-2">{user.fullName}</dd>
          </div>
          <div className="grid gap-2 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="ui-label mb-0">Username</dt>
            <dd className="font-mono text-sm font-medium text-slate-900 sm:col-span-2">{user.username}</dd>
          </div>
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
