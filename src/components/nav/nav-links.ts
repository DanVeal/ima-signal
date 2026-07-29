import type { OrgRole } from "@/types/domain";

export interface NavLink {
  href: string;
  label: string;
  visibleTo: (role: OrgRole) => boolean;
}

const isIma = (role: OrgRole) => role.startsWith("ima_");
const isJet2Reviewer = (role: OrgRole) => role === "jet2_reviewer";

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", visibleTo: () => true },
  { href: "/projects", label: "Projects", visibleTo: () => true },
  {
    href: "/review-queue",
    label: "Review Queue",
    visibleTo: (role) => isIma(role) || isJet2Reviewer(role),
  },
  { href: "/activity", label: "Activity", visibleTo: () => true },
  {
    href: "/people",
    label: "People",
    visibleTo: (role) => isIma(role),
  },
  { href: "/settings", label: "Settings", visibleTo: () => true },
];

export function navLinksForRole(role: OrgRole): NavLink[] {
  return NAV_LINKS.filter((link) => link.visibleTo(role));
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  ima_admin: "IMA Admin",
  ima_producer: "IMA Producer",
  ima_reviewer: "IMA Reviewer",
  jet2_reviewer: "Jet2 Reviewer",
  jet2_view_only: "Jet2 View Only",
  studio_admin: "Studio Admin",
  studio_contributor: "Studio Contributor",
};
