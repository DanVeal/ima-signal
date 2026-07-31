import { DemoUserProvider } from "@/lib/demo-user-context";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { CommandPalette } from "@/components/search/command-palette";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DemoUserProvider>
      <CommandPaletteProvider>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <CommandPalette />
        <OnboardingTour />
      </CommandPaletteProvider>
    </DemoUserProvider>
  );
}
