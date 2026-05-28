"use client";

import { useActionState } from "react";
import { requestAdminOtpAction, verifyAdminOtpAction } from "@/app/admin/actions";
import type { ActionState } from "@/lib/admin/types";

const initialState: ActionState = {
  ok: false,
  message: "",
};

export function AdminAuthForms() {
  const [requestState, requestAction, requestPending] = useActionState(requestAdminOtpAction, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyAdminOtpAction, initialState);
  const email = requestState.email ?? "";

  return (
    <div className="grid gap-6">
      <form action={requestAction} className="rounded-md border border-navy/10 bg-white p-6 text-charcoal shadow-xl">
        <h2 className="text-2xl font-black">Email code sign in</h2>
        <p className="mt-2 text-sm leading-6 text-charcoal/65">Enter a whitelisted admin email. If it has access, Supabase will send a one-time code.</p>
        <label className="mt-6 block">
          <span className="text-sm font-bold">Email</span>
          <input
            name="email"
            className="mt-2 w-full rounded-md border border-navy/10 px-4 py-3 outline-none focus:border-emerald"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
          />
        </label>
        {requestState.message ? <p className={requestState.ok ? "mt-4 text-sm font-bold text-emerald" : "mt-4 text-sm font-bold text-red-600"}>{requestState.message}</p> : null}
        <button className="mt-6 w-full rounded-md bg-emerald px-5 py-3 text-sm font-black text-white disabled:opacity-60" disabled={requestPending} type="submit">
          {requestPending ? "Sending code..." : "Send login code"}
        </button>
      </form>

      <form action={verifyAction} className="rounded-md border border-white/10 bg-navy/70 p-6 text-white shadow-xl">
        <h2 className="text-2xl font-black">Enter code</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">Use the code from your email. No password is used for admin access.</p>
        <input type="hidden" name="email" value={email} />
        <label className="mt-6 block">
          <span className="text-sm font-bold">Code</span>
          <input
            name="token"
            className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white outline-none focus:border-emerald"
            inputMode="numeric"
            pattern="[0-9]{6,8}"
            maxLength={8}
            required
          />
        </label>
        {verifyState.message ? <p className={verifyState.ok ? "mt-4 text-sm font-bold text-emerald" : "mt-4 text-sm font-bold text-red-200"}>{verifyState.message}</p> : null}
        <button className="mt-6 w-full rounded-md bg-gold px-5 py-3 text-sm font-black text-navy disabled:opacity-60" disabled={verifyPending || !email} type="submit">
          {verifyPending ? "Verifying..." : "Continue to dashboard"}
        </button>
      </form>
    </div>
  );
}
