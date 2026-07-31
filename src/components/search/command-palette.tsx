"use client";

/**
 * Global command palette (⌘K / Ctrl+K) — search across the product plus a
 * short list of keyboard-accessible quick actions. Presentation only: every
 * action here either navigates to a page that already exists or triggers a
 * button that's already on that page (e.g. "Generate transcript" scrolls to
 * the same AI panel the reviewer would otherwise click into) — no new
 * mutations are introduced here.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Captions,
  Clock,
  FileText,
  FolderKanban,
  Home,
  ListChecks,
  Megaphone,
  MessageSquare,
  Mic,
  Settings as SettingsIcon,
  Sparkles,
  Upload,
  Users as UsersIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCommandPalette } from "@/lib/command-palette-context";
import { useDemoUser } from "@/lib/demo-user-context";
import { useLocalStorageState } from "@/lib/use-local-storage-state";
import { getAllOrganisations, getAllUsers } from "@/lib/mock/queries";
import { ROLE_LABEL } from "@/components/nav/nav-links";
import { searchAction } from "@/lib/search/actions";
import type { SearchResult, SearchResultType } from "@/lib/search/queries";

const MAX_RECENT_SEARCHES = 6;

const RESULT_GROUPS: { type: SearchResultType; heading: string; icon: React.ElementType }[] = [
  { type: "project", heading: "Projects", icon: FolderKanban },
  { type: "recording", heading: "Recordings", icon: Mic },
  { type: "prams_reference", heading: "PRAMS references", icon: Megaphone },
  { type: "script", heading: "Scripts", icon: FileText },
  { type: "transcript", heading: "Transcripts", icon: Captions },
  { type: "comment", heading: "Comments", icon: MessageSquare },
  { type: "user", heading: "People", icon: UsersIcon },
];

interface NavAction {
  value: string;
  label: string;
  icon: React.ElementType;
  href: string;
  keywords?: string[];
}

const NAV_ACTIONS: NavAction[] = [
  { value: "nav-dashboard", label: "Go to Dashboard", icon: Home, href: "/", keywords: ["home"] },
  { value: "nav-projects", label: "Open Project", icon: FolderKanban, href: "/projects", keywords: ["browse projects"] },
  { value: "nav-review-queue", label: "Review Queue", icon: ListChecks, href: "/review-queue" },
  { value: "nav-activity", label: "Activity", icon: ActivityIcon, href: "/activity" },
  { value: "nav-people", label: "People", icon: UsersIcon, href: "/people" },
  {
    value: "nav-prams",
    label: "Jump to PRAMS registry",
    icon: Megaphone,
    href: "/prams-registry",
    keywords: ["prams"],
  },
  { value: "nav-scripts", label: "Scripts registry", icon: FileText, href: "/scripts-registry" },
  { value: "nav-settings", label: "Settings", icon: SettingsIcon, href: "/settings" },
];

function matchesQuery(label: string, keywords: string[] | undefined, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const haystack = [label, ...(keywords ?? [])].join(" ").toLowerCase();
  return haystack.includes(trimmed);
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [recentSearches, setRecentSearches] = useLocalStorageState<string[]>("ima-signal.recent-searches", []);
  const router = useRouter();
  const pathname = usePathname();
  const { setCurrentUserId } = useDemoUser();

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const currentProjectId = projectMatch?.[1];
  const onRecordingPage = /^\/projects\/[^/]+\/recordings\/[^/]+$/.test(pathname);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) return;
    // Deferred past the closing animation so the palette never flashes stale
    // results the next time it's opened.
    const timeout = setTimeout(() => {
      setQuery("");
      setResults([]);
      setSwitchingWorkspace(false);
    }, 150);
    return () => clearTimeout(timeout);
  }, [open]);

  const searchable = !switchingWorkspace && query.trim().length >= 2;

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      searchAction(query)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, searchable]);

  // Derived at render time rather than reset via an effect: as soon as the
  // query is too short (or the switch-workspace sub-page is open) the stale
  // async results are simply not shown, regardless of when the last fetch resolves.
  const groupedResults = useMemo(() => {
    if (!searchable) return [];
    return RESULT_GROUPS.map((group) => ({ ...group, items: results.filter((r) => r.type === group.type) })).filter(
      (group) => group.items.length > 0,
    );
  }, [results, searchable]);

  const matchingNavActions = NAV_ACTIONS.filter((action) => matchesQuery(action.label, action.keywords, query));
  const switchWorkspaceMatches = matchesQuery("Switch Workspace", ["preview as", "role"], query);
  const generateTranscriptMatches =
    onRecordingPage && matchesQuery("Generate Transcript", ["transcribe"], query);
  const uploadRecordingMatches =
    currentProjectId && matchesQuery("Upload a Recording", ["upload"], query);
  const viewRecordingsMatches =
    currentProjectId && matchesQuery("Find Recording", ["view recordings"], query);

  const organisations = getAllOrganisations();
  const users = getAllUsers();
  const groupedUsers = organisations.map((org) => ({
    org,
    users: users.filter((u) => u.organisationId === org.id),
  }));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function selectResult(item: SearchResult) {
    const trimmed = query.trim();
    if (trimmed) {
      setRecentSearches((prev) => [trimmed, ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT_SEARCHES));
    }
    go(item.url);
  }

  function removeRecentSearch(term: string) {
    setRecentSearches((prev) => prev.filter((q) => q !== term));
  }

  function scrollToAiPanel() {
    setOpen(false);
    // Already on the recording page — no navigation needed, just bring the
    // AI panel (the same "Generate transcript" button seen inline) into view.
    setTimeout(() => document.getElementById("ai-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      value={query}
      onValueChange={setQuery}
      shouldFilter={false}
      label="Command palette"
      description="Search projects, recordings, scripts, PRAMS references, comments, transcripts and people, or run a command."
    >
      <CommandInput
        placeholder={switchingWorkspace ? "Preview as..." : "Search or run a command..."}
      />
      <CommandList>
        {switchingWorkspace ? (
          <>
            <CommandGroup>
              <CommandItem value="switch-back" onSelect={() => setSwitchingWorkspace(false)}>
                <ArrowLeft className="size-4 text-muted-foreground" />
                Back
              </CommandItem>
            </CommandGroup>
            {groupedUsers.map(({ org, users: orgUsers }) => (
              <CommandGroup key={org.id} heading={org.name}>
                {orgUsers.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`user-${user.id}`}
                    keywords={[user.fullName, ROLE_LABEL[user.role]]}
                    onSelect={() => {
                      setCurrentUserId(user.id);
                      setOpen(false);
                    }}
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">
                        {user.avatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span>{user.fullName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </>
        ) : (
          <>
            <CommandEmpty>
              {query.trim().length < 2 ? "Type to search, or pick a command below." : "No results found."}
            </CommandEmpty>

            {query.trim().length === 0 && recentSearches.length > 0 && (
              <CommandGroup heading="Recent searches">
                {recentSearches.map((term) => (
                  <CommandItem key={term} value={`recent-search-${term}`} onSelect={() => setQuery(term)}>
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{term}</span>
                    <button
                      type="button"
                      aria-label={`Remove "${term}" from recent searches`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(term);
                      }}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groupedResults.map((group) => (
              <CommandGroup key={group.type} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    value={`${item.type}-${item.id}`}
                    onSelect={() => selectResult(item)}
                  >
                    <group.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {(matchingNavActions.length > 0 ||
              switchWorkspaceMatches ||
              generateTranscriptMatches ||
              uploadRecordingMatches ||
              viewRecordingsMatches) && (
              <>
                {groupedResults.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Quick actions">
                  {generateTranscriptMatches && (
                    <CommandItem value="action-generate-transcript" onSelect={scrollToAiPanel}>
                      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                      Generate transcript
                    </CommandItem>
                  )}
                  {uploadRecordingMatches && (
                    <CommandItem
                      value="action-upload-recording"
                      onSelect={() => go(`/projects/${currentProjectId}/recordings/upload`)}
                    >
                      <Upload className="size-4 shrink-0 text-muted-foreground" />
                      Upload a recording
                    </CommandItem>
                  )}
                  {viewRecordingsMatches && (
                    <CommandItem
                      value="action-view-recordings"
                      onSelect={() => go(`/projects/${currentProjectId}/recordings`)}
                    >
                      <Mic className="size-4 shrink-0 text-muted-foreground" />
                      Find a recording
                    </CommandItem>
                  )}
                  {matchingNavActions.map((action) => (
                    <CommandItem key={action.value} value={action.value} onSelect={() => go(action.href)}>
                      <action.icon className="size-4 shrink-0 text-muted-foreground" />
                      {action.label}
                    </CommandItem>
                  ))}
                  {switchWorkspaceMatches && (
                    <CommandItem value="action-switch-workspace" onSelect={() => setSwitchingWorkspace(true)}>
                      <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
                      Switch Workspace
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
