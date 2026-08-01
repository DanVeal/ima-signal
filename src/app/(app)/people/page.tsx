import Link from "next/link";
import { Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile, getOrganisations } from "@/lib/supabase/repository";
import { toOrganisationDomain, toUserProfileDomain } from "@/lib/supabase/mappers";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

const ORG_TYPE_LABEL: Record<string, string> = {
  ima: "Producing organisation",
  jet2: "Client organisation",
  studio: "Recording studio",
};

export default async function PeoplePage() {
  const supabase = await createClient();
  const [orgRows, { data: userRows, error }, profile] = await Promise.all([
    getOrganisations(supabase),
    supabase.from("user_profiles").select("*").order("full_name"),
    getCurrentUserProfile(supabase),
  ]);
  if (error) throw error;

  const organisations = orgRows.map(toOrganisationDomain);
  const users = (userRows ?? []).map(toUserProfileDomain);
  const isAdmin = profile?.role === "ima_admin";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="People"
        description="Everyone with access across IMA, Jet2 and your recording studios."
      />
      {organisations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No organisations yet"
          description={
            isAdmin
              ? "Create IMA, client, and studio organisations from the Admin area."
              : "Organisations will appear here once your IMA Admin sets them up."
          }
          action={
            isAdmin ? (
              <Button size="sm" render={<Link href="/admin" />}>
                Go to Admin
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {organisations.map((org) => {
            const orgUsers = users.filter((u) => u.organisationId === org.id);
            return (
              <Panel key={org.id} title={org.name} description={ORG_TYPE_LABEL[org.type]}>
                {orgUsers.length === 0 ? (
                  <p className="text-sm text-text-muted">No one from this organisation yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {orgUsers.map((user) => (
                      <li key={user.id} className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-ink-100 text-xs font-medium text-ink-700">
                            {user.avatarInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">{user.fullName}</p>
                          <p className="truncate text-xs text-text-muted">{ROLE_LABEL[user.role]}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
