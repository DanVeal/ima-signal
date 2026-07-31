"use client";

import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import type { ApprovalDecision, AudioVersion, UserProfile } from "@/types/domain";

const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approve: "Approve",
  approve_minor: "Approve with minor changes",
  request_changes: "Request changes",
  return_to_ima: "Return to IMA",
  not_ready: "Not ready for review",
};

function decisionsFor(status: AudioVersion["status"], role: UserProfile["role"]): ApprovalDecision[] {
  if (status === "ready_for_ima_review" && role.startsWith("ima_")) {
    return ["approve", "approve_minor", "request_changes", "not_ready"];
  }
  if (status === "ready_for_jet2_review" && role === "jet2_reviewer") {
    return ["approve", "approve_minor", "request_changes", "return_to_ima"];
  }
  return [];
}

export function ApprovalPanel({
  audioVersion,
  currentUser,
  onDecide,
}: {
  audioVersion: AudioVersion;
  currentUser: UserProfile;
  onDecide: (decision: ApprovalDecision, comment: string) => void;
}) {
  const [open, setOpen] = useState<ApprovalDecision | null>(null);
  const [comment, setComment] = useState("");

  if (audioVersion.isApproved) {
    return (
      <div className="rounded-md border border-success/25 bg-success-100 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-success">
          <Lock className="size-4" />
          Approved and locked
        </p>
        <p className="mt-1 text-xs text-text-emphasis">
          Approved {audioVersion.approvedAt ? formatDateTime(audioVersion.approvedAt) : ""}. A new
          version would need to be uploaded and reviewed separately — this version can&apos;t be
          changed.
        </p>
      </div>
    );
  }

  const available = decisionsFor(audioVersion.status, currentUser.role);

  if (available.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-sm text-text-muted">
        You don&apos;t currently have an approval action available for this version.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {available.map((decision) => (
        <Dialog
          key={decision}
          open={open === decision}
          onOpenChange={(next) => setOpen(next ? decision : null)}
        >
          <DialogTrigger
            render={
              <Button
                variant={decision === "approve" ? "default" : "outline"}
                className="w-full justify-start"
              />
            }
          >
            {decision === "approve" && <ShieldCheck className="size-4" />}
            {DECISION_LABEL[decision]}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{DECISION_LABEL[decision]}</DialogTitle>
              <DialogDescription>
                This will be recorded against V{audioVersion.versionNumber} with your name,
                organisation and the current time.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note for this decision (optional)"
              rows={3}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onDecide(decision, comment);
                  setComment("");
                  setOpen(null);
                }}
              >
                Confirm {DECISION_LABEL[decision].toLowerCase()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
