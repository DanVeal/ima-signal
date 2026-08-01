"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "./server";

export interface SignInState {
  error?: string;
}

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "user_banned") {
      return { error: "This account has been disabled. Contact your IMA Admin if you think that's a mistake." };
    }
    return { error: "Incorrect email or password." };
  }

  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export interface ForgotPasswordState {
  error?: string;
  sent?: boolean;
}

/** Always reports success even for an unknown email — never confirm which addresses have accounts. */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const originHeader = (await headers()).get("origin");
  const origin = originHeader ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  return { sent: true };
}

export interface UpdatePasswordState {
  error?: string;
}

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "That reset link has expired. Request a new one from the login page." };

  redirect("/");
}
