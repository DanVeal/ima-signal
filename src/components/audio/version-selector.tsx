import { ShieldCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { AudioVersion } from "@/types/domain";

export function VersionSelector({
  versions,
  selectedId,
  onChange,
}: {
  versions: AudioVersion[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const approved = versions.find((v) => v.isApproved);

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={(value) => value && onChange(value)}>
        <SelectTrigger className="w-40" aria-label="Select audio version">
          <SelectValue>
            {(value: string) => {
              const version = versions.find((v) => v.id === value);
              return version ? `V${version.versionNumber} · ${formatDate(version.createdAt)}` : value;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sorted.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              <span className="flex items-center gap-1.5">
                V{version.versionNumber} · {formatDate(version.createdAt)}
                {version.isApproved && <ShieldCheck className="size-3 text-success" />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {approved && approved.id !== selectedId && (
        <Button variant="outline" size="sm" onClick={() => onChange(approved.id)}>
          <ShieldCheck className="size-3.5 text-success" />
          Approved version
        </Button>
      )}
    </div>
  );
}
