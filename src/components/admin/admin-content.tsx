"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Loader2, MoreHorizontal, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { OrganisationPicker } from "@/components/organisations/organisation-picker";
import { OrganisationsPanel } from "@/components/admin/organisations-panel";
import { formatDateTime } from "@/lib/format";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUserRoleAndOrg,
  type CreateUserState,
} from "@/lib/admin/actions";
import type { AdminUserRow } from "@/lib/admin/queries";
import type { Database } from "@/lib/supabase/database.types";

type OrgRow = Database["public"]["Tables"]["organisations"]["Row"];
type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_OPTIONS: UserRole[] = [
  "ima_admin",
  "ima_producer",
  "ima_reviewer",
  "jet2_reviewer",
  "jet2_view_only",
  "studio_admin",
  "studio_contributor",
];

const createUserInitialState: CreateUserState = {};

function TempPasswordBanner({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-brand/30 bg-brand-100/20 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-text-primary">
          Temporary password for {email}
        </p>
        <p className="mt-1 font-mono text-sm text-text-primary">{password}</p>
        <p className="mt-1 text-xs text-text-muted">
          Share this now — it won&apos;t be shown again. They can change it any time from Settings, or via
          &quot;Forgot password&quot; on the login page.
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(password);
            setCopied(true);
          }}
        >
          <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function CreateUserPanel({ organisations }: { organisations: OrgRow[] }) {
  const [state, formAction, pending] = useActionState(createUser, createUserInitialState);
  const [dismissed, setDismissed] = useState(false);
  const [role, setRole] = useState<UserRole | undefined>(undefined);

  const showBanner = state.tempPassword && state.createdEmail && !dismissed;

  return (
    <Panel title="Create user" description="No self-serve sign-up — every account starts here.">
      {showBanner ? (
        <div className="space-y-4">
          <TempPasswordBanner
            email={state.createdEmail!}
            password={state.tempPassword!}
            onDismiss={() => setDismissed(true)}
          />
          <Button variant="outline" size="sm" onClick={() => setDismissed(true)}>
            <UserPlus className="size-3.5" /> Create another
          </Button>
        </div>
      ) : (
        <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="organisationId">Organisation</Label>
            <OrganisationPicker
              name="organisationId"
              organisations={organisations.filter((o) => o.is_active)}
              canCreate
              triggerId="organisationId"
              placeholder="Select an organisation"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select name="role" value={role} onValueChange={(v) => v && setRole(v as UserRole)} required>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role">{role ? ROLE_LABEL[role] : undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {state.error && (
            <p className="sm:col-span-2 rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              {pending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

function UserRowActions({
  user,
  onChanged,
  onPasswordReset,
  onToggleActive,
}: {
  user: AdminUserRow;
  onChanged: (message: string) => void;
  onPasswordReset: (password: string) => void;
  onToggleActive: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="icon-xs" variant="ghost" aria-label="User actions" disabled={isPending}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              const result = await resetUserPassword(user.id);
              if (result.error) onChanged(result.error);
              else if (result.tempPassword) onPasswordReset(result.tempPassword);
            })
          }
        >
          Reset password
        </DropdownMenuItem>
        <DropdownMenuItem
          variant={user.isActive ? "destructive" : "default"}
          onClick={() =>
            startTransition(async () => {
              const result = await setUserActive(user.id, !user.isActive);
              if (result.error) onChanged(result.error);
              else onToggleActive();
            })
          }
        >
          {user.isActive ? "Disable account" : "Reactivate account"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminContent({
  users,
  organisations,
  currentUserProfileId,
}: {
  users: AdminUserRow[];
  organisations: OrgRow[];
  currentUserProfileId: string;
}) {
  const [rows, setRows] = useState(users);
  const [banner, setBanner] = useState<{ userId: string; password: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggleActive(userId: string) {
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, isActive: !r.isActive } : r)));
  }

  function handleRoleOrOrgChange(userId: string, role: UserRole, organisationId: string) {
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, role, organisationId } : r)));
    startTransition(async () => {
      const org = organisations.find((o) => o.id === organisationId);
      const result = await updateUserRoleAndOrg(userId, role, organisationId);
      if (result.error) {
        setErrorMessage(result.error);
        setRows(users); // revert optimistic change on failure
      } else if (org) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === userId ? { ...r, organisationName: org.name, organisationType: org.type } : r,
          ),
        );
      }
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Admin"
        description="Create accounts, manage roles and organisations, and disable access — IMA Admin only."
      />

      <div className="space-y-6">
        <CreateUserPanel organisations={organisations} />

        <OrganisationsPanel organisations={organisations} />

        <Panel title="People" description={`${rows.length} ${rows.length === 1 ? "account" : "accounts"}.`}>
          {errorMessage && (
            <p className="mb-4 rounded-md bg-important-100 px-3 py-2 text-sm text-important">{errorMessage}</p>
          )}
          {banner && rows.find((r) => r.id === banner.userId) && (
            <div className="mb-4">
              <TempPasswordBanner
                email={rows.find((r) => r.id === banner.userId)!.email}
                password={banner.password}
                onDismiss={() => setBanner(null)}
              />
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.id} className={!user.isActive ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="bg-ink-100 text-[11px] font-medium text-ink-700">
                          {user.avatarInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {user.fullName}
                          {user.id === currentUserProfileId && (
                            <span className="ml-1.5 text-xs text-text-muted">(you)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-text-muted">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.organisationId}
                      onValueChange={(orgId) => orgId && handleRoleOrOrgChange(user.id, user.role, orgId)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs" aria-label={`Organisation for ${user.fullName}`}>
                        <SelectValue>{user.organisationName}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {organisations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(role) => role && handleRoleOrOrgChange(user.id, role as UserRole, user.organisationId)}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label={`Role for ${user.fullName}`}>
                        <SelectValue>{ROLE_LABEL[user.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline" className="gap-1 border-emerald-300/50 text-[10px] text-emerald-700">
                        <ShieldCheck className="size-3" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-text-muted">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={user}
                      onChanged={(message) => setErrorMessage(message)}
                      onPasswordReset={(password) => setBanner({ userId: user.id, password })}
                      onToggleActive={() => handleToggleActive(user.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </>
  );
}
