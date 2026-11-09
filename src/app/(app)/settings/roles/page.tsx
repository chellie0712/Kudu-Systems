import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { deleteRole } from "@/app/actions/roles";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RoleEditor, type PermissionRow } from "@/components/RoleEditor";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { PERMISSIONS, PERMISSION_INFO, ROLE_LABELS, permissionsOf } from "@/lib/permissions";

export const metadata = { title: "Roles" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string }> }) {
  await requirePermission("settings.manage");
  const me = await requirePermission("users.manage");
  const isAdmin = me.role === "ADMIN" && !me.permissions;
  const { msg, err, edit } = await searchParams;
  const db = await tenantDb();
  const roles = await db.customRole.findMany({
    orderBy: { name: "asc" },
    include: { users: { select: { name: true, email: true, disabled: true }, orderBy: { name: "asc" } } },
  });
  const editing = edit && edit !== "new" ? roles.find((r) => r.id === edit) : undefined;
  const rows: PermissionRow[] = PERMISSIONS.map((p) => ({ permission: p, ...PERMISSION_INFO[p] }));
  const presets = { OFFICE: permissionsOf("OFFICE"), TECHNICIAN: permissionsOf("TECHNICIAN") };
  const label = (p: string) => (p in PERMISSION_INFO ? PERMISSION_INFO[p as keyof typeof PERMISSION_INFO].label : p);

  return (
    <div>
      <PageHeader
        back={{ href: "/settings#users", label: "Settings" }}
        title="Roles"
        subtitle="Set up your own roles, such as Sales rep, Supervisor or Bookkeeper, and tick exactly what each can see, edit and approve. Give a role to someone under Settings → Users & roles."
        actions={isAdmin && !edit ? <Link href="/settings/roles?edit=new" className="btn-primary">+ New role</Link> : undefined}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {!isAdmin && <Flash message="Only an admin can add or change roles." tone="error" />}

      {isAdmin && edit && (edit === "new" || editing) && (
        <div className="card mb-6 p-6">
          <SectionTitle>{editing ? `Edit ${editing.name}` : "New role"}</SectionTitle>
          <RoleEditor role={editing} rows={rows} presets={presets} />
          <Link href="/settings/roles" className="mt-3 inline-block text-sm text-charcoal-500 hover:text-kudu-600">Cancel</Link>
        </div>
      )}

      <div className="card divide-y divide-charcoal-100">
        <div className="p-4 text-sm">
          <div className="font-semibold">Built-in roles</div>
          <p className="text-charcoal-500">
            {ROLE_LABELS.ADMIN} (everything), {ROLE_LABELS.OFFICE} and {ROLE_LABELS.TECHNICIAN}. These can&apos;t be changed; see the table under{" "}
            <Link href="/settings#users" className="text-kudu-600">Users &amp; roles</Link>. A company always keeps at least one {ROLE_LABELS.ADMIN}.
          </p>
        </div>
        {roles.length === 0 ? (
          <Empty>No custom roles yet.</Empty>
        ) : (
          roles.map((r) => (
            <div key={r.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  {r.description && <div className="text-charcoal-500">{r.description}</div>}
                  <div className="mt-1 text-xs text-charcoal-500">
                    {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"} · falls back to {ROLE_LABELS[r.baseRole]} ·{" "}
                    {r.users.length ? r.users.map((u) => u.name || u.email).join(", ") : "nobody has this role"}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Link href={`/settings/roles?edit=${r.id}`} className="btn-outline py-1 text-xs">Edit</Link>
                    <form action={deleteRole}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        message={`Delete the ${r.name} role?${r.users.length ? ` Its ${r.users.length} user(s) go back to ${ROLE_LABELS[r.baseRole]}.` : ""}`}
                        className="btn-outline py-1 text-xs text-kudu-700"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-kudu-600">What it can do</summary>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-charcoal-600 sm:grid-cols-2">
                  {r.permissions.length ? r.permissions.map((p) => <li key={p}>✓ {label(p)}</li>) : <li>Nothing yet</li>}
                </ul>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
