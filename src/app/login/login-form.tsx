"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/supabase/actions";

const initialState: SignInState = {};

const ERROR_MESSAGES: Record<string, string> = {
  "reset-link-expired": "That link has expired or was already used. Request a new one below.",
};

export function LoginForm({ next, urlError }: { next?: string; urlError?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const errorMessage = state.error ?? (urlError ? ERROR_MESSAGES[urlError] : undefined);

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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {errorMessage && (
          <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-text-muted">
        Don&apos;t have an account? Ask your IMA producer to set one up for you.
      </p>
    </div>
  );
}
