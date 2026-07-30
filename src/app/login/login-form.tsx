"use client";

import { useActionState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/supabase/actions";

const initialState: SignInState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="rounded-xl border border-border-strong/60 bg-surface-raised p-8 shadow-sm">
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/"} />

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state.error && (
          <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-text-muted">
        Local development — see docs/phase-2a-environment.md for seeded account credentials.
      </p>
    </div>
  );
}
