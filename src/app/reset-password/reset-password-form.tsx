"use client";

import { useActionState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type UpdatePasswordState } from "@/lib/supabase/actions";

const initialState: UpdatePasswordState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <div className="rounded-xl border border-border-strong/60 bg-surface-raised p-8 shadow-sm">
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>
        )}

        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
