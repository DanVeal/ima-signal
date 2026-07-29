import { DemoUserProvider } from "@/lib/demo-user-context";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DemoUserProvider>
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </DemoUserProvider>
  );
}
