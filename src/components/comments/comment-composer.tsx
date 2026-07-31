"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimecode } from "@/lib/format";
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from "@/lib/comment-categories";
import type { CommentCategory } from "@/types/domain";

export function CommentComposer({
  selectedText,
  startMs,
  endMs,
  onSubmit,
  onCancel,
}: {
  selectedText?: string;
  startMs?: number;
  endMs?: number;
  onSubmit: (data: { category: CommentCategory; body: string }) => void;
  onCancel?: () => void;
}) {
  const [category, setCategory] = useState<CommentCategory>(selectedText ? "wording" : "general");
  const [body, setBody] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        onSubmit({ category, body: body.trim() });
        setBody("");
      }}
      className="space-y-3 rounded-md border border-border bg-surface-sunken p-3"
    >
      {selectedText && (
        <div className="rounded-md border border-comment/25 bg-comment-100 px-2.5 py-2 text-xs text-ink-700">
          <p className="font-medium text-comment">
            {startMs !== undefined && endMs !== undefined
              ? `${formatTimecode(startMs)}–${formatTimecode(endMs)}`
              : "Selected wording"}
          </p>
          <p className="mt-0.5">&ldquo;{selectedText}&rdquo;</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as CommentCategory)}>
          <SelectTrigger className="h-8 w-48 text-xs" aria-label="Comment category">
            <SelectValue>{(value: CommentCategory) => CATEGORY_LABEL[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add your feedback…"
        rows={3}
        aria-label="Comment"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!body.trim()}>
          Comment
        </Button>
      </div>
    </form>
  );
}
