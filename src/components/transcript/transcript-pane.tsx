"use client";

import { useRef } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import type { QcDifference, ReviewComment, TranscriptWord } from "@/types/domain";

export interface WordSelection {
  start: number;
  end: number;
}

const SEVERITY_UNDERLINE: Record<QcDifference["severity"], string> = {
  critical: "decoration-critical decoration-2",
  important: "decoration-important decoration-2",
  minor: "decoration-minor decoration-2",
  uncertain: "decoration-uncertain decoration-2 decoration-dotted",
};

function findDifference(word: TranscriptWord, differences: QcDifference[]) {
  return differences.find((d) => word.startMs < d.endMs && word.endMs > d.startMs);
}

function findComment(word: TranscriptWord, comments: ReviewComment[]) {
  return comments.find(
    (c) => c.startMs !== undefined && c.endMs !== undefined && word.startMs < c.endMs! && word.endMs > c.startMs!,
  );
}

export function TranscriptPane({
  words,
  differences,
  comments,
  selection,
  onSelectionChange,
  onOpenComment,
}: {
  words: TranscriptWord[];
  differences: QcDifference[];
  comments: ReviewComment[];
  selection: WordSelection | null;
  onSelectionChange: (selection: WordSelection | null) => void;
  onOpenComment?: (commentId: string) => void;
}) {
  const { currentMs, seek } = useAudioPlayback();
  const lastClickedIndex = useRef<number | null>(null);

  const handleWordClick = (index: number, word: TranscriptWord, event: React.MouseEvent) => {
    if (event.shiftKey && lastClickedIndex.current !== null) {
      onSelectionChange({
        start: Math.min(lastClickedIndex.current, index),
        end: Math.max(lastClickedIndex.current, index),
      });
      return;
    }
    lastClickedIndex.current = index;
    onSelectionChange({ start: index, end: index });
    seek(word.startMs);
  };

  return (
    <div
      className="text-base leading-loose text-ink-800 sm:text-[17px]"
      aria-label="Transcript"
      role="group"
    >
      {words.map((word, index) => {
        const isActive = currentMs >= word.startMs && currentMs < word.endMs;
        const diff = findDifference(word, differences);
        const comment = findComment(word, comments);
        const isSelected = selection && index >= selection.start && index <= selection.end;
        const lowConfidence = word.confidence < 0.85;

        return (
          <span key={word.id} className="inline">
            <button
              type="button"
              onClick={(e) => handleWordClick(index, word, e)}
              title={
                lowConfidence
                  ? `${Math.round(word.confidence * 100)}% transcription confidence`
                  : undefined
              }
              className={cn(
                "rounded px-0.5 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive && "bg-brand text-white",
                !isActive && isSelected && "bg-comment-100",
                !isActive && !isSelected && "hover:bg-ink-100",
                diff && !isActive && "underline decoration-2 underline-offset-4",
                diff && SEVERITY_UNDERLINE[diff.severity],
                lowConfidence && !isActive && "decoration-dotted",
              )}
            >
              {word.word}
            </button>
            {comment && (
              <button
                type="button"
                aria-label="Open comment"
                onClick={() => onOpenComment?.(comment.id)}
                className="mx-0.5 inline-flex size-4 items-center justify-center rounded-full bg-comment-100 align-super text-comment"
              >
                <MessageCircle className="size-2.5" strokeWidth={2.5} />
              </button>
            )}{" "}
          </span>
        );
      })}
    </div>
  );
}
