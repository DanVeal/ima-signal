import { DemoUserProvider } from "@/lib/demo-user-context";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { CommandPalette } from "@/components/search/command-palette";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import type { getCurrentUserProfile } from "@/lib/supabase/repository";
import { SiteHeader } from "./site-header";

export type CurrentUserProfile = Awaited<ReturnType<typeof getCurrentUserProfile>>;

export function AppShell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: CurrentUserProfile;
}) {
  return (
    <DemoUserProvider>
      <CommandPaletteProvider>
        <SiteHeader profile={profile} />
        <main className="flex-1">{children}</main>
        <CommandPalette />
        <OnboardingTour />
      </CommandPaletteProvider>
    </DemoUserProvider>
  );
}
