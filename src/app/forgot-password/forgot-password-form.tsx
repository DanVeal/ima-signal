"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotPasswordState } from "@/lib/supabase/actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="rounded-xl border border-border-strong/60 bg-surface-raised p-8 shadow-sm">
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      {state.sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand">
            <Mail className="size-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium text-text-primary">Check your email</p>
          <p className="text-sm text-text-muted">
            If an account exists for that address, a password reset link is on its way.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>

          {state.error && (
            <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>
          )}

          <Button type="submit" disabled={pending} className="w-full justify-center">
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
