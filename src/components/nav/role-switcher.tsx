"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signOut } from "@/lib/supabase/actions";
import { ROLE_LABEL } from "./nav-links";
import type { CurrentUserProfile } from "./app-shell";

/** Real account menu for the signed-in user — no organisation directory, no role switching. */
export function RoleSwitcher({ profile }: { profile: CurrentUserProfile }) {
  if (!profile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-raised py-1 pl-1 pr-2.5 text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-6">
          <AvatarFallback className="bg-brand-100 text-[11px] font-medium text-brand">
            {profile.avatar_initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-left sm:block">
          <span className="block text-xs leading-tight font-medium text-text-emphasis">{profile.full_name}</span>
          <span className="block text-[11px] leading-tight text-text-muted">{ROLE_LABEL[profile.role]}</span>
        </span>
        <ChevronDown className="size-3.5 text-text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-text-emphasis">{profile.full_name}</p>
          <p className="text-xs text-text-muted">{profile.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />} className="flex items-center gap-2">
          <Settings className="size-3.5" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2 text-critical">
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
