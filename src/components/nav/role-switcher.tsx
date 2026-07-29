"use client";

import { Fragment } from "react";
import { ChevronDown, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDemoUser } from "@/lib/demo-user-context";
import { getAllOrganisations, getAllUsers } from "@/lib/mock/queries";
import { ROLE_LABEL } from "./nav-links";

/**
 * Phase 1 has no Supabase Auth session yet, so there is no real "sign in".
 * This lets reviewers preview how navigation and permissions change across
 * every role ahead of Phase 2 — clearly labelled as a preview affordance,
 * never presented as a real account switcher.
 */
export function RoleSwitcher() {
  const { currentUser, setCurrentUserId } = useDemoUser();
  const users = getAllUsers();
  const organisations = getAllOrganisations();

  const grouped = organisations.map((org) => ({
    org,
    users: users.filter((u) => u.organisationId === org.id),
  }));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-raised py-1 pl-1 pr-2.5 text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <Avatar className="size-6">
          <AvatarFallback className="bg-brand-100 text-[11px] font-medium text-brand">
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-left sm:block">
          <span className="block text-xs leading-tight font-medium text-ink-800">
            {currentUser.fullName}
          </span>
          <span className="block text-[11px] leading-tight text-text-muted">
            {ROLE_LABEL[currentUser.role]}
          </span>
        </span>
        <ChevronDown className="size-3.5 text-text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-normal tracking-wide text-text-muted uppercase">
          <Eye className="size-3" />
          Previewing as
        </div>
        {grouped.map(({ org, users: orgUsers }, index) => (
          <Fragment key={org.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-text-secondary">{org.name}</DropdownMenuLabel>
              {orgUsers.map((user) => (
                <DropdownMenuItem
                  key={user.id}
                  onClick={() => setCurrentUserId(user.id)}
                  className="flex items-center gap-2"
                >
                  <Avatar className="size-6">
                    <AvatarFallback className="bg-ink-100 text-[11px] font-medium text-ink-700">
                      {user.avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex flex-col">
                    <span className="text-xs font-medium text-ink-800">{user.fullName}</span>
                    <span className="text-[11px] text-text-muted">{ROLE_LABEL[user.role]}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
