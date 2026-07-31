import { Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/states/empty-state";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { createClient } from "@/lib/supabase/server";
import { getOrganisations } from "@/lib/supabase/repository";
import { toOrganisationDomain, toUserProfileDomain } from "@/lib/supabase/mappers";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

const ORG_TYPE_LABEL: Record<string, string> = {
  ima: "Producing organisation",
  jet2: "Client organisation",
  studio: "Recording studio",
};

/**
 * Phase 2A proof-of-foundation: this page reads organisations and user
 * profiles from the real Supabase database (via RLS as the signed-in user),
 * not src/lib/mock/. It was chosen as the first page to convert because it
 * has no dependency on tables that don't exist yet (scripts, audio, etc.) —
 * see docs/phase-2a-limitations.md for why every other page still reads
 * mock data for now.
 */
export default async function PeoplePage() {
  const supabase = await createClient();
  const [orgRows, { data: userRows, error }] = await Promise.all([
    getOrganisations(supabase),
    supabase.from("user_profiles").select("*").order("full_name"),
  ]);
  if (error) throw error;

  const organisations = orgRows.map(toOrganisationDomain);
  const users = (userRows ?? []).map(toUserProfileDomain);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="People"
        description="Everyone with access across IMA, Jet2 and your recording studios."
      />
      {organisations.length === 0 ? (
        <EmptyState icon={Users} title="No organisations yet" description="Organisations will appear here once set up." />
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
                          <p className="truncate text-sm font-medium text-ink-900">{user.fullName}</p>
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
