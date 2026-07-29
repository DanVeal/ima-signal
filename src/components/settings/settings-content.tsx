"use client";

import { useState } from "react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDemoUser } from "@/lib/demo-user-context";
import { getOrganisation } from "@/lib/mock/queries";
import { ROLE_LABEL } from "@/components/nav/nav-links";

const NOTIFICATION_EVENTS = [
  { key: "invited", label: "You're invited to a project" },
  { key: "assigned", label: "A project is assigned to you" },
  { key: "ready-to-record", label: "A script is ready to record" },
  { key: "uploaded", label: "A recording is uploaded" },
  { key: "ready-for-review", label: "A recording is ready for your review" },
  { key: "comment", label: "You're mentioned in a comment" },
  { key: "changes-requested", label: "Changes are requested" },
  { key: "changes-acknowledged", label: "A change request is acknowledged" },
  { key: "new-version", label: "A new version is uploaded" },
  { key: "approved", label: "A recording is approved" },
  { key: "deadline", label: "A deadline is approaching" },
  { key: "overdue", label: "A review becomes overdue" },
  { key: "delivered", label: "A project is marked delivered" },
] as const;

export function SettingsContent() {
  const { currentUser } = useDemoUser();
  const organisation = getOrganisation(currentUser.organisationId);
  const [digest, setDigest] = useState(true);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, true])),
  );

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Your profile and notification preferences." />
      <div className="space-y-6">
        <Panel title="Profile">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarFallback className="bg-brand-100 text-sm font-medium text-brand">
                {currentUser.avatarInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-ink-900">{currentUser.fullName}</p>
              <p className="text-xs text-text-muted">{currentUser.email}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {organisation?.name} · {ROLE_LABEL[currentUser.role]}
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Email notifications"
          description="Choose what IMA Signal emails you about. Related updates are grouped into a single digest rather than sent one at a time."
        >
          <div className="mb-4 flex items-center justify-between rounded-md border border-border-subtle px-3 py-2.5">
            <div>
              <Label htmlFor="digest-mode" className="text-sm font-medium text-ink-900">
                Group into a daily digest
              </Label>
              <p className="text-xs text-text-muted">
                Off sends each notification as a separate email instead.
              </p>
            </div>
            <Switch id="digest-mode" checked={digest} onCheckedChange={setDigest} />
          </div>

          <ul className="divide-y divide-border-subtle">
            {NOTIFICATION_EVENTS.map((event) => (
              <li key={event.key} className="flex items-center justify-between gap-3 py-2.5">
                <Label htmlFor={event.key} className="text-sm text-ink-800">
                  {event.label}
                </Label>
                <Switch
                  id={event.key}
                  checked={enabled[event.key]}
                  onCheckedChange={(checked) =>
                    setEnabled((prev) => ({ ...prev, [event.key]: checked }))
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
