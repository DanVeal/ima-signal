"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { WorkspaceBadge } from "@/components/brand/workspace-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCommandPalette } from "@/lib/command-palette-context";
import { navLinksForRole, ROLE_LABEL } from "./nav-links";
import { RoleSwitcher } from "./role-switcher";
import { cn } from "@/lib/utils";
import type { CurrentUserProfile } from "./app-shell";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function SiteHeader({ profile }: { profile: CurrentUserProfile }) {
  const pathname = usePathname();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const links = navLinksForRole(profile?.role ?? "jet2_view_only");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle/70 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-(--width-wide) items-center gap-4 px-4 sm:px-6 lg:px-10">
        <div className="flex shrink-0 items-center gap-2.5">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <span aria-hidden className="h-4 w-px bg-border-default" />
          <WorkspaceBadge />
        </div>

        <nav className="hidden flex-1 items-center gap-0.5 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-100 text-brand"
                    : "text-text-secondary hover:bg-ink-100 hover:text-ink-900",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            className="hidden text-text-muted sm:inline-flex"
            aria-label="Search IMA Signal"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="size-4" />
            <span className="hidden lg:inline">Search...</span>
            <kbd className="hidden rounded border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-text-muted lg:inline">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Search IMA Signal"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="size-4" />
          </Button>
          <div className="hidden sm:block">
            <RoleSwitcher profile={profile} />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="lg:hidden" />}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-border-subtle px-5 py-4">
                <SheetTitle className="flex items-center gap-2.5">
                  <Logo />
                </SheetTitle>
                <WorkspaceBadge className="-ml-1" />
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
                {links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-100 text-brand"
                          : "text-text-secondary hover:bg-ink-100 hover:text-ink-900",
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              {profile && (
                <div className="mt-auto border-t border-border-subtle p-4">
                  <p className="text-sm font-medium text-text-emphasis">{profile.full_name}</p>
                  <p className="text-xs text-text-muted">{ROLE_LABEL[profile.role]}</p>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
