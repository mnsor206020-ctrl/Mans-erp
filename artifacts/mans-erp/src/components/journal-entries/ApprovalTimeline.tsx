import { ArrowRight, User, Clock, MessageSquareQuote, GitCommit } from "lucide-react";
import { useLanguage } from "@/lib/language-provider";

const ACTION_COLORS: Record<string, string> = {
  SUBMIT:  "bg-blue-100 text-blue-800 border-blue-200",
  APPROVE: "bg-green-100 text-green-800 border-green-200",
  REJECT:  "bg-amber-100 text-amber-800 border-amber-200",
  POST:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  LOCK:    "bg-purple-100 text-purple-800 border-purple-200",
  REVERSE: "bg-orange-100 text-orange-800 border-orange-200",
  VOID:    "bg-red-100 text-red-800 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:        "bg-slate-100 text-slate-700 border-slate-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED:     "bg-blue-100 text-blue-800 border-blue-200",
  POSTED:       "bg-green-100 text-green-800 border-green-200",
  LOCKED:       "bg-purple-100 text-purple-800 border-purple-200",
  REVERSED:     "bg-orange-100 text-orange-800 border-orange-200",
  VOIDED:       "bg-red-100 text-red-800 border-red-200",
};

function formatDateTime(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-SA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined, t: (k: string) => string): string | null {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return t("je.timeline.tookSeconds").replace("{{n}}", String(seconds));
  const minutes = Math.round(seconds / 60);
  return t("je.timeline.tookMinutes").replace("{{n}}", String(minutes));
}

interface ApprovalRecord {
  id: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  comment?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
  user?: {
    id: string;
    firstNameEn?: string | null;
    lastNameEn?: string | null;
    email: string;
  } | null;
}

interface Props {
  approvals: ApprovalRecord[];
}

export default function ApprovalTimeline({ approvals }: Props) {
  const { t } = useLanguage();

  if (!approvals || approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
        <GitCommit className="w-8 h-8 opacity-30" />
        <p className="text-sm">{t("je.timeline.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {approvals.map((ap, idx) => {
        const isLast = idx === approvals.length - 1;
        const actionColor = ACTION_COLORS[ap.action] ?? "bg-slate-100 text-slate-700 border-slate-200";
        const userName = ap.user
          ? `${ap.user.firstNameEn || ""} ${ap.user.lastNameEn || ""}`.trim() || ap.user.email
          : "—";
        const durationText = formatDuration(ap.durationSeconds, t);
        const actionLabel = t(`je.action.${ap.action}`) || ap.action;

        return (
          <div key={ap.id} className="flex gap-3">
            {/* Connector column */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 ${actionColor}`}>
                {ap.action.charAt(0)}
              </div>
              {!isLast && <div className="w-px flex-1 min-h-3 bg-border my-1" />}
            </div>

            {/* Content */}
            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
              {/* Action badge + status transition */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${actionColor}`}>
                  {actionLabel}
                </span>
                {ap.fromStatus && ap.toStatus && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className={`rounded-full border px-1.5 py-0.5 text-xs ${STATUS_COLORS[ap.fromStatus] ?? ""}`}>
                      {t(`je.status.${ap.fromStatus}`) || ap.fromStatus}
                    </span>
                    <ArrowRight className="w-3 h-3 flex-shrink-0" />
                    <span className={`rounded-full border px-1.5 py-0.5 text-xs ${STATUS_COLORS[ap.toStatus] ?? ""}`}>
                      {t(`je.status.${ap.toStatus}`) || ap.toStatus}
                    </span>
                  </span>
                )}
              </div>

              {/* Actor + timestamp + duration */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {userName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(ap.createdAt)}
                </span>
                {durationText && (
                  <span className="text-muted-foreground/70 italic">{durationText}</span>
                )}
              </div>

              {/* Comment */}
              {ap.comment && (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                  <p className={`text-xs italic leading-relaxed ${ap.action === "REJECT" ? "text-amber-700" : "text-muted-foreground"}`}>
                    "{ap.comment}"
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
