"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, MessagesSquare, PartyPopper, Search, Settings as SettingsIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ONBOARDING_STORAGE_KEY } from "@/lib/onboarding";

const STEPS = [
  {
    icon: PartyPopper,
    title: "Welcome to IMA Signal",
    description:
      "The single source of truth for Jet2 radio production — from approved script to signed-off audio. Here's where everything lives, in under a minute.",
  },
  {
    icon: Search,
    title: "Search finds anything, instantly",
    description: "Press ⌘K (or Ctrl+K) from anywhere to jump straight to a project, recording, or person by name.",
  },
  {
    icon: LayoutDashboard,
    title: "Home is your control room",
    description:
      "What needs your attention, what's awaiting approval, and what's arriving soon — all in one place, always up to date.",
  },
  {
    icon: MessagesSquare,
    title: "Review recordings together",
    description:
      "Comment on a moment, request a change, or approve a version — every recording keeps one running conversation, with everyone's history alongside it.",
  },
  {
    icon: SettingsIcon,
    title: "Make it yours",
    description: "Set a default playback speed, pick light or dark, and see every keyboard shortcut — all in Settings.",
  },
];

/**
 * Mounted once in AppShell — renders nothing until a browser has never
 * completed (or skipped) the tour before. Deliberately reads localStorage
 * directly in an effect (not the shared useLocalStorageState/
 * useSyncExternalStore hook): `open` only ever needs to go from false to
 * true once, well after mount, so there's no cross-component sync to gain,
 * and starting `open` at a fixed `false` (matching every render up to that
 * point) avoids ever rendering the Dialog with a soon-to-be-wrong value —
 * doing that leaves Base UI's exit animation stuck mid-transition.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored !== "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, []);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function finish() {
    setOpen(false);
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand">
            <current.icon className="size-5" strokeWidth={1.75} />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-5 bg-brand" : "w-1.5 bg-ink-200",
              )}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={isLast ? finish : () => setStep((s) => s + 1)}>
              {isLast ? "Get started" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
