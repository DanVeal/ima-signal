import { AppShell } from "@/components/nav/app-shell";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
