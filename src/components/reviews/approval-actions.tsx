"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ApprovalDecision } from "@/lib/review/service";

function NoteAction({
  label,
  icon: Icon,
  variant,
  onConfirm,
}: {
  label: string;
  icon: typeof Check;
  variant: "default" | "outline" | "destructive";
  onConfirm: (note?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" variant={variant}>
            <Icon className="size-3.5" /> {label}
          </Button>
        }
      />
      <PopoverContent className="w-72 space-y-2">
        <p className="text-xs font-medium text-text-emphasis">{label} — optional note</p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context…" className="min-h-16 text-sm" />
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(note.trim() || undefined);
                setOpen(false);
                setNote("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : "Confirm"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ApprovalActions({
  canDecide,
  currentDecision,
  onDecide,
  onWithdraw,
}: {
  canDecide: boolean;
  /** The current version's latest decision, if any — drives which actions make sense. */
  currentDecision: "approved" | "changes_requested" | "withdrawn" | null;
  onDecide: (decision: ApprovalDecision, note?: string) => Promise<void>;
  onWithdraw: (note?: string) => Promise<void>;
}) {
  if (!canDecide) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentDecision !== "approved" && (
        <NoteAction label="Approve" icon={Check} variant="default" onConfirm={(note) => onDecide("approved", note)} />
      )}
      <NoteAction
        label="Request changes"
        icon={ShieldAlert}
        variant="outline"
        onConfirm={(note) => onDecide("changes_requested", note)}
      />
      {currentDecision === "approved" || currentDecision === "changes_requested" ? (
        <NoteAction label="Withdraw" icon={RotateCcw} variant="outline" onConfirm={onWithdraw} />
      ) : null}
    </div>
  );
}
