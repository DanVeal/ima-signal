"use client";

import { Building2, Keyboard, Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { toUserProfileDomain } from "@/lib/supabase/mappers";
import { useTheme, type Theme } from "@/lib/theme-context";
import {
  PLAYBACK_RATE_OPTIONS,
  SKIP_SECONDS_OPTIONS,
  usePlaybackPreferences,
} from "@/lib/playback-preferences";
import { useLocalStorageState } from "@/lib/use-local-storage-state";
import type { getCurrentUserProfile } from "@/lib/supabase/repository";

const ORG_TYPE_LABEL: Record<string, string> = {
  ima: "Producing organisation",
  jet2: "Client organisation",
  studio: "Recording studio",
};

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

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const SHORTCUTS = [
  { keys: "⌘ / Ctrl + K", description: "Open search & jump to anything" },
  { keys: "Space", description: "Play or pause the recording" },
  { keys: "← / →", description: "Skip back/forward (Playback tab sets the amount)" },
  { keys: "⌘ / Ctrl + Enter", description: "Post a comment or reply" },
  { keys: "Esc", description: "Close search or a dropdown" },
];

type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentUserProfile>>>;

export function SettingsContent({
  profile,
  colleagueCount,
}: {
  profile: Profile;
  colleagueCount: number;
}) {
  const user = toUserProfileDomain(profile);
  const organisation = profile.organisation;

  const { theme, setTheme, resolvedTheme } = useTheme();
  const { rate, setRate, skipSeconds, setSkipSeconds } = usePlaybackPreferences();
  const [digest, setDigest] = useLocalStorageState("ima-signal.notif-digest", true);
  const [enabled, setEnabled] = useLocalStorageState<Record<string, boolean>>(
    "ima-signal.notif-events",
    Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, true])),
  );

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" description="Your profile, workspace and preferences." />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="playback">Playback</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5">
          <Panel title="Profile">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="bg-brand-100 text-sm font-medium text-brand">
                  {user.avatarInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-text-primary">{user.fullName}</p>
                <p className="text-xs text-text-muted">{user.email}</p>
                <p className="mt-0.5 text-xs text-text-muted">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="workspace" className="mt-5">
          <Panel title="Workspace" description="The organisation your account belongs to.">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                <Building2 className="size-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{organisation?.name ?? "—"}</p>
                <p className="text-xs text-text-muted">
                  {organisation ? ORG_TYPE_LABEL[organisation.type] : ""} · {colleagueCount}{" "}
                  {colleagueCount === 1 ? "person" : "people"}
                </p>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="playback" className="mt-5">
          <Panel
            title="Playback"
            description="Applied the next time you open a recording — won't change one that's already playing."
          >
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-medium text-text-primary">Default speed</Label>
                <div className="mt-2 flex gap-1.5">
                  {PLAYBACK_RATE_OPTIONS.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={rate === option ? "default" : "outline"}
                      onClick={() => setRate(option)}
                    >
                      {option}×
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-text-primary">Skip interval</Label>
                <div className="mt-2 flex gap-1.5">
                  {SKIP_SECONDS_OPTIONS.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={skipSeconds === option ? "default" : "outline"}
                      onClick={() => setSkipSeconds(option)}
                    >
                      {option}s
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="notifications" className="mt-5">
          <Panel
            title="Email notifications"
            description="Choose what IMA Signal emails you about. Related updates are grouped into a single digest rather than sent one at a time. Preview only — this environment doesn't send email."
          >
            <div className="mb-4 flex items-center justify-between rounded-md border border-border-subtle px-3 py-2.5">
              <div>
                <Label htmlFor="digest-mode" className="text-sm font-medium text-text-primary">
                  Group into a daily digest
                </Label>
                <p className="text-xs text-text-muted">Off sends each notification as a separate email instead.</p>
              </div>
              <Switch id="digest-mode" checked={digest} onCheckedChange={setDigest} />
            </div>

            <ul className="divide-y divide-border-subtle">
              {NOTIFICATION_EVENTS.map((event) => (
                <li key={event.key} className="flex items-center justify-between gap-3 py-2.5">
                  <Label htmlFor={event.key} className="text-sm text-text-emphasis">
                    {event.label}
                  </Label>
                  <Switch
                    id={event.key}
                    checked={enabled[event.key] ?? true}
                    onCheckedChange={(checked) => setEnabled((prev) => ({ ...prev, [event.key]: checked }))}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="shortcuts" className="mt-5">
          <Panel title="Keyboard shortcuts">
            <ul className="divide-y divide-border-subtle">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.keys} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm text-text-emphasis">{shortcut.description}</span>
                  <kbd className="shrink-0 rounded-md border border-border-strong/60 bg-surface-sunken px-2 py-1 font-mono text-xs text-text-emphasis">
                    {shortcut.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="appearance" className="mt-5">
          <Panel title="Appearance" description={`Currently showing ${resolvedTheme}.`}>
            <div className="flex gap-1.5">
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={theme === option.value ? "default" : "outline"}
                  onClick={() => setTheme(option.value)}
                >
                  <option.icon className="size-3.5" />
                  {option.label}
                </Button>
              ))}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-1.5 text-xs text-text-muted">
        <Keyboard className="size-3.5" />
        Press ⌘K anywhere to search — see the Shortcuts tab for the full list.
      </div>
    </>
  );
}
