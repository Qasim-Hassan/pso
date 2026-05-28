import { redirect } from "next/navigation";
import { AdminAuthForms } from "@/components/admin/admin-auth-forms";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminContext } from "@/lib/admin/auth";

export const metadata = {
  title: "Admin Login | Pakistan Olympiads",
};

export default async function AdminLoginPage() {
  const context = await getAdminContext();
  if (context.isConfigured && context.user && context.member) redirect("/admin/dashboard");

  if (!context.isConfigured) {
    return (
      <AdminShell context={context} title="Admin setup" description="Connect Supabase before using the secure admin dashboard.">
        <div />
      </AdminShell>
    );
  }

  return (
    <main className="dark-panel science-field flex min-h-screen items-center justify-center px-4 py-12 text-white">
      <div className="relative z-10 w-full max-w-xl">
        <AdminAuthForms />
      </div>
    </main>
  );
}
