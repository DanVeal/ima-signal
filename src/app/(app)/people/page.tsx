import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { getAllOrganisations, getAllUsers } from "@/lib/mock/queries";

const ORG_TYPE_LABEL: Record<string, string> = {
  ima: "Producing organisation",
  jet2: "Client organisation",
  studio: "Recording studio",
};

export default function PeoplePage() {
  const organisations = getAllOrganisations();
  const users = getAllUsers();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="People"
        title="People"
        description="Everyone with access across IMA, Jet2 and your recording studios."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {organisations.map((org) => (
          <Panel key={org.id} title={org.name} description={ORG_TYPE_LABEL[org.type]}>
            <ul className="space-y-3">
              {users
                .filter((u) => u.organisationId === org.id)
                .map((user) => (
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
          </Panel>
        ))}
      </div>
    </PageContainer>
  );
}
