"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDemoUser } from "@/lib/demo-user-context";
import { navLinksForRole, ROLE_LABEL } from "./nav-links";
import { RoleSwitcher } from "./role-switcher";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { currentUser } = useDemoUser();
  const links = navLinksForRole(currentUser.role);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-(--width-wide) items-center gap-6 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center">
          <Logo />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-ink-900" : "text-text-secondary hover:text-ink-900",
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            aria-label="Search IMA Signal"
          >
            <Search className="size-4" />
          </Button>
          <div className="hidden sm:block">
            <RoleSwitcher />
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
                <SheetTitle>
                  <Logo />
                </SheetTitle>
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
              <div className="mt-auto border-t border-border-subtle p-4">
                <p className="mb-2 text-[11px] font-medium tracking-wide text-text-muted uppercase">
                  Previewing as
                </p>
                <p className="text-sm font-medium text-ink-800">{currentUser.fullName}</p>
                <p className="text-xs text-text-muted">{ROLE_LABEL[currentUser.role]}</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
