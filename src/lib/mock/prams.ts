/**
 * PRAMS Matrix — prototype only, no backend.
 *
 * PRAMS is Jet2's own passenger-announcement production document — a
 * standing library of numbered cabin announcements (e.g. "080.J2 -
 * BOARDING"), organised by flight phase, with variant announcements for
 * circumstances such as a VIP service or a fuel-stop routing. In the
 * source spreadsheet, cells are merged wherever the same announcement is
 * used across several circumstances. This file models that same
 * structure — phase, circumstance, announcement — so the matrix reads as
 * the document producers already know, not a generic table.
 *
 * The specific wording below is placeholder demo copy, not Jet2's actual
 * scripts — only the section names and the "NNN.J2 - TITLE" numbering
 * convention are meant to match the real document.
 */

export interface PramsCircumstance {
  id: string;
  label: string;
}

export interface PramsAnnouncement {
  code: string;
  title: string;
  body: string;
}

/** One merged span: this announcement is used for these circumstances. */
export interface PramsGroup {
  circumstanceIds: string[];
  announcement: PramsAnnouncement;
}

export interface PramsSection {
  id: string;
  name: string;
  groups: PramsGroup[];
}

/** A contiguous run of columns sharing one announcement — the renderable unit. */
export interface PramsRun {
  startIndex: number;
  span: number;
  announcement: PramsAnnouncement;
}

/**
 * Resolves a section's groups into contiguous runs against a fixed column
 * order. A group's circumstances don't need to be adjacent in that order —
 * if they aren't, the same announcement simply renders as more than one
 * run (still styled identically), rather than one impossible merged cell.
 */
export function getSectionRuns(
  section: PramsSection,
  circumstances: PramsCircumstance[],
): PramsRun[] {
  const byCircumstance = new Map<string, PramsAnnouncement>();
  for (const group of section.groups) {
    for (const id of group.circumstanceIds) {
      byCircumstance.set(id, group.announcement);
    }
  }

  const runs: PramsRun[] = [];
  for (let i = 0; i < circumstances.length; i++) {
    const announcement = byCircumstance.get(circumstances[i].id);
    if (!announcement) continue;
    const previous = runs[runs.length - 1];
    if (previous && previous.announcement.code === announcement.code && previous.startIndex + previous.span === i) {
      previous.span += 1;
    } else {
      runs.push({ startIndex: i, span: 1, announcement });
    }
  }
  return runs;
}

export const PRAMS_CIRCUMSTANCES: PramsCircumstance[] = [
  { id: "standard", label: "Standard" },
  { id: "delayed", label: "Delayed" },
  { id: "night", label: "Night Flight" },
  { id: "vip", label: "VIP" },
  { id: "fuel-stop", label: "Fuel Stop" },
];

export const PRAMS_SECTIONS: PramsSection[] = [
  {
    id: "boarding",
    name: "Boarding",
    groups: [
      {
        circumstanceIds: ["standard", "delayed", "night"],
        announcement: {
          code: "080.J2",
          title: "BOARDING",
          body: "Good morning/afternoon/evening, and welcome aboard this Jet2.com flight to [destination]. Cabin crew, please prepare the cabin for departure.",
        },
      },
      {
        circumstanceIds: ["vip", "fuel-stop"],
        announcement: {
          code: "081A.J2",
          title: "BOARDING & FUEL - VIP",
          body: "Good morning/afternoon/evening, and welcome aboard this Jet2.com flight to [destination]. Please note this aircraft will be making a technical fuel stop before reaching its final destination.",
        },
      },
    ],
  },
  {
    id: "safety-demonstration",
    name: "Safety Demonstration",
    groups: [
      {
        circumstanceIds: ["standard", "delayed", "night", "vip", "fuel-stop"],
        announcement: {
          code: "090.J2",
          title: "SAFETY DEMONSTRATION",
          body: "Cabin crew are now demonstrating the safety features of this aircraft. Please direct your attention to the cabin crew or the video screens for the duration of this demonstration.",
        },
      },
    ],
  },
  {
    id: "after-take-off",
    name: "After Take-off",
    groups: [
      {
        circumstanceIds: ["standard", "vip", "fuel-stop"],
        announcement: {
          code: "100.J2",
          title: "AFTER TAKE-OFF",
          body: "Ladies and gentlemen, the captain has now turned off the seatbelt sign. You are free to move around the cabin, but we do recommend keeping your seatbelt fastened while seated.",
        },
      },
      {
        circumstanceIds: ["delayed"],
        announcement: {
          code: "101.J2",
          title: "AFTER TAKE-OFF - DELAY APOLOGY",
          body: "Ladies and gentlemen, once again we're sorry for this evening's delay in departing. The captain has now turned off the seatbelt sign, and cabin crew will begin the inflight service shortly.",
        },
      },
      {
        circumstanceIds: ["night"],
        announcement: {
          code: "102.J2",
          title: "AFTER TAKE-OFF - NIGHT FLIGHT",
          body: "Ladies and gentlemen, the captain has now turned off the seatbelt sign. Cabin lighting has been dimmed for the remainder of this evening's flight — individual reading lights can be found above your seat.",
        },
      },
    ],
  },
  {
    id: "arrival",
    name: "Arrival",
    groups: [
      {
        circumstanceIds: ["standard", "delayed", "night", "vip"],
        announcement: {
          code: "110.J2",
          title: "ARRIVAL",
          body: "Ladies and gentlemen, we'll shortly be landing at [destination]. Please ensure your seatbelt is fastened, seat back and table are stowed, and window blinds are open.",
        },
      },
      {
        circumstanceIds: ["fuel-stop"],
        announcement: {
          code: "111.J2",
          title: "ARRIVAL - CONNECTING FLIGHT",
          body: "Ladies and gentlemen, we'll shortly be landing at [destination]. If you are continuing on this aircraft to [final destination], please remain in your seat during the technical stop.",
        },
      },
    ],
  },
];
