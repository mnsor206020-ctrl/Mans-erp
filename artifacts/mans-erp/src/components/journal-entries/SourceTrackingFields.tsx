import { useState } from "react";
import { useLanguage } from "@/lib/language-provider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Source type registry ────────────────────────────────────────────────────
//
// Add entries here when new source modules are introduced.
// The translation key pattern is: je.source.type.<Value>

const SOURCE_TYPES = [
  "Donor",
  "Project",
  "Fund",
  "Grant",
  "Payroll",
  "Contract",
  "Budget",
] as const;

type SourceType = (typeof SOURCE_TYPES)[number] | "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceTrackingValues {
  sourceType: string;
  sourceReference: string;
  sourceModuleUrl: string;
}

interface SourceTrackingFieldsProps {
  value: SourceTrackingValues;
  onChange: (values: SourceTrackingValues) => void;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SourceTrackingFields({
  value,
  onChange,
  disabled = false,
  className,
}: SourceTrackingFieldsProps) {
  const { t, dir } = useLanguage();
  const [open, setOpen] = useState(false);

  const hasValues =
    !!value.sourceType ||
    !!value.sourceReference ||
    !!value.sourceModuleUrl;

  // Convenience updater — merges a partial change into the full value object
  const update = (patch: Partial<SourceTrackingValues>) =>
    onChange({ ...value, ...patch });

  // When the section is collapsed and already has values, keep it open
  // so data is not silently hidden.
  const isOpen = open || hasValues;

  const moduleUrlInvalid =
    !!value.sourceModuleUrl && !value.sourceModuleUrl.startsWith("/");

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen} className={className}>
      {/* ── Toggle trigger ─────────────────────────────────────────────── */}
      <CollapsibleTrigger
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-1 py-2",
          "text-sm font-medium text-muted-foreground",
          "transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className="flex items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0" />
          {t("je.source.section")}
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
            {t("je.source.optional")}
          </Badge>
          {hasValues && !isOpen && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {value.sourceType || "—"}
            </Badge>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      {/* ── Collapsible fields ─────────────────────────────────────────── */}
      <CollapsibleContent>
        <div
          dir={dir}
          className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {/* Source Type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("je.source.type")}
            </Label>
            <Select
              value={(value.sourceType as SourceType) || ""}
              onValueChange={(v) =>
                update({ sourceType: v === "_clear" ? "" : v })
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue
                  placeholder={t("je.source.type.placeholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {value.sourceType && (
                  <SelectItem value="_clear" className="text-muted-foreground italic">
                    — {t("common.cancel")} —
                  </SelectItem>
                )}
                {SOURCE_TYPES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {t(`je.source.type.${st}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source Reference */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("je.source.reference")}
            </Label>
            <Input
              className="h-9 text-sm"
              value={value.sourceReference}
              onChange={(e) => update({ sourceReference: e.target.value })}
              placeholder={t("je.source.reference.placeholder")}
              disabled={disabled}
            />
          </div>

          {/* Source Module URL */}
          <div className="space-y-1.5">
            <Label
              className={cn(
                "text-xs",
                moduleUrlInvalid
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {t("je.source.moduleUrl")}
            </Label>
            <Input
              dir="ltr"
              className={cn(
                "h-9 font-mono text-sm",
                moduleUrlInvalid &&
                  "border-destructive focus-visible:ring-destructive",
              )}
              value={value.sourceModuleUrl}
              onChange={(e) => update({ sourceModuleUrl: e.target.value })}
              placeholder={t("je.source.moduleUrl.placeholder")}
              disabled={disabled}
            />
            {moduleUrlInvalid && (
              <p className="text-xs text-destructive">
                {t("je.source.moduleUrl.hint")}
              </p>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
