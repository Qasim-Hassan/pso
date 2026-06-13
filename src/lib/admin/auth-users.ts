import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

type AdminMemberIdentity = {
  id: string;
  email: string;
  user_id: string | null;
};

const existingUserErrorCodes = new Set(["email_exists", "user_already_exists"]);

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (page >= data.lastPage) return null;
    page += 1;
  }
}

async function getLinkedUser(supabase: SupabaseClient, member: AdminMemberIdentity) {
  if (!member.user_id) return null;

  const { data, error } = await supabase.auth.admin.getUserById(member.user_id);
  if (error || data.user.email?.toLowerCase() !== member.email) return null;
  return data.user;
}

export async function ensureConfirmedAdminAuthUser(supabase: SupabaseClient, member: AdminMemberIdentity) {
  const email = member.email.toLowerCase();
  let user: User | null = await getLinkedUser(supabase, { ...member, email });

  if (!user) {
    const created = await supabase.auth.admin.createUser({ email, email_confirm: true });

    if (created.error) {
      if (!created.error.code || !existingUserErrorCodes.has(created.error.code)) throw created.error;
      user = await findAuthUserByEmail(supabase, email);
    } else {
      user = created.data.user;
    }
  }

  if (!user) throw new Error("The whitelisted Auth user could not be prepared.");

  if (!user.email_confirmed_at) {
    const confirmed = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (confirmed.error) throw confirmed.error;
    user = confirmed.data.user;
  }

  if (member.user_id !== user.id) {
    const linked = await supabase.from("admin_members").update({ user_id: user.id }).eq("id", member.id);
    if (linked.error) throw linked.error;
  }

  return user;
}
