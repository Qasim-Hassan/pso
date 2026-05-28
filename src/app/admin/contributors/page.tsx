import { AdminShell } from "@/components/admin/admin-shell";
import { ModeratorAccessForm } from "@/components/admin/contributor-role-form";
import { requireOwner } from "@/lib/admin/auth";
import { getAdminModerators } from "@/lib/admin/content";

export const metadata = {
  title: "Access | Admin",
};

export default async function AdminContributorsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const context = await requireOwner();
  const { edit } = await searchParams;
  const moderators = await getAdminModerators();
  const selected = moderators.find((member) => member.id === edit) ?? null;

  return (
    <AdminShell context={context} title="Access" description="Whitelist passwordless admin users and assign granular moderator permissions.">
      <div className="space-y-6">
        <ModeratorAccessForm member={selected} />

        <div className="overflow-x-auto rounded-md border border-white/10 bg-white/5">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#061117]/70 text-xs uppercase text-white/50">
              <tr>{["Member", "Status", "Permissions", "Last login", "Updated", "Manage"].map((header) => <th key={header} className="border-b border-white/10 px-4 py-3">{header}</th>)}</tr>
            </thead>
            <tbody>
              {moderators.map((member) => (
                <tr key={member.id} className="border-b border-white/10">
                  <td className="px-4 py-3">
                    <p className="font-black text-white">{member.displayName}</p>
                    <p className="mt-1 text-xs text-white/55">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-white/75">{member.status}</td>
                  <td className="px-4 py-3 text-white/75">{permissionSummary(member)}</td>
                  <td className="px-4 py-3 text-white/60">{member.lastLoginAt ?? "Never"}</td>
                  <td className="px-4 py-3 text-white/60">{member.updatedAt}</td>
                  <td className="px-4 py-3">
                    <a href={`/admin/contributors?edit=${member.id}`} className="font-black text-emerald">
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {moderators.length === 0 ? <div className="p-8 text-center text-sm font-bold text-white/60">No admin users found. Insert the first owner in Supabase, then manage access here.</div> : null}
        </div>
      </div>
    </AdminShell>
  );
}

function permissionSummary(member: Awaited<ReturnType<typeof getAdminModerators>>[number]) {
  if (member.isOwner) return "Owner";
  const parts = [];
  if (member.permissions.blogs) parts.push("Blogs");
  if (member.permissions.guides) parts.push("Guides");
  if (member.permissions.resourceSubjects.length > 0) parts.push(`Resources: ${member.permissions.resourceSubjects.join(", ")}`);
  return parts.join(" | ") || "No permissions";
}
