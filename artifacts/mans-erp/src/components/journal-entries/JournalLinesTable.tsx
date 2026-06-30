import { useLanguage } from "@/lib/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AccountPicker, type AccountOption } from "./AccountPicker";

export interface LineState {
  _key: string;
  accountId: string;
  accountLabel: string;
  costCenterId: string;
  lineNumber: number;
  descriptionEn: string;
  descriptionAr: string;
  debit: string;
  credit: string;
  reference: string;
}

interface CostCenterOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string | null;
}

interface JournalLinesTableProps {
  lines: LineState[];
  accounts: AccountOption[];
  costCenters: CostCenterOption[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onUpdateLine: (key: string, field: keyof LineState, value: string) => void;
  onSetLineAccount: (key: string, accountId: string, accountLabel: string) => void;
}

/**
 * Editable lines grid for a journal entry form.
 *
 * Accessibility:
 * - Each debit/credit input has aria-label identifying the line number.
 * - Remove button has aria-label="Remove line N".
 * - Balance indicator has role="status" + aria-live="polite".
 * - Minimum 2 lines enforced: Remove button is disabled when lines.length <= 2.
 *
 * Reusability: this component will also be used in Sprint 2.3 (JournalEntryDetail)
 * in read-only mode — add a `readOnly?: boolean` prop at that point.
 */
export function JournalLinesTable({
  lines,
  accounts,
  costCenters,
  totalDebit,
  totalCredit,
  isBalanced,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onSetLineAccount,
}: JournalLinesTableProps) {
  const { t, lang } = useLanguage();
  const diff = Math.abs(totalDebit - totalCredit);

  const formatNum = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t("je.lines")}
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={onAddLine}>
            <Plus className="w-4 h-4" />
            {t("je.addLine")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-start font-semibold py-2.5 px-3 w-8">{t("je.lineNo")}</th>
                <th className="text-start font-semibold py-2.5 px-3 min-w-[220px]">{t("je.account")} *</th>
                <th className="text-start font-semibold py-2.5 px-3 min-w-[160px]">{t("je.description")}</th>
                <th className="text-start font-semibold py-2.5 px-3 min-w-[140px]">{t("je.costCenter")}</th>
                <th className="text-end font-semibold py-2.5 px-3 min-w-[120px]">{t("je.debit")}</th>
                <th className="text-end font-semibold py-2.5 px-3 min-w-[120px]">{t("je.credit")}</th>
                <th className="py-2.5 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line._key} className="border-b">
                  <td className="py-2 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="py-2 px-3">
                    <AccountPicker
                      id={`line-account-${line._key}`}
                      value={line.accountId}
                      onChange={(id, label) => onSetLineAccount(line._key, id, label)}
                      accounts={accounts}
                      placeholder={t("je.selectAccount")}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      aria-label={`Line ${idx + 1} description`}
                      value={line.descriptionEn}
                      onChange={(e) => onUpdateLine(line._key, "descriptionEn", e.target.value)}
                      placeholder="Description"
                      className="h-9 text-xs"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Select
                      value={line.costCenterId || "_none"}
                      onValueChange={(v) =>
                        onUpdateLine(line._key, "costCenterId", v === "_none" ? "" : v)
                      }
                    >
                      <SelectTrigger className="h-9 text-xs" aria-label={`Line ${idx + 1} cost center`}>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">—</SelectItem>
                        {costCenters.map((cc) => (
                          <SelectItem key={cc.id} value={cc.id}>
                            {cc.code} —{" "}
                            {lang === "ar" ? (cc.nameAr || cc.nameEn) : (cc.nameEn || cc.nameAr)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Line ${idx + 1} debit`}
                      value={line.debit}
                      onChange={(e) => {
                        onUpdateLine(line._key, "debit", e.target.value);
                        if (e.target.value) onUpdateLine(line._key, "credit", "");
                      }}
                      placeholder="0.00"
                      className="h-9 text-end font-mono text-xs text-emerald-700"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Line ${idx + 1} credit`}
                      value={line.credit}
                      onChange={(e) => {
                        onUpdateLine(line._key, "credit", e.target.value);
                        if (e.target.value) onUpdateLine(line._key, "debit", "");
                      }}
                      placeholder="0.00"
                      className="h-9 text-end font-mono text-xs text-blue-700"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveLine(line._key)}
                      disabled={lines.length <= 2}
                      aria-label={`Remove line ${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/20">
                <td colSpan={4} className="py-3 px-3"></td>
                <td className="py-3 px-3 text-end font-mono font-semibold text-emerald-700">
                  {formatNum(totalDebit)}
                </td>
                <td className="py-3 px-3 text-end font-mono font-semibold text-blue-700">
                  {formatNum(totalCredit)}
                </td>
                <td className="py-3 px-3"></td>
              </tr>
              <tr>
                <td colSpan={7} className="px-3 py-2">
                  <div
                    role="status"
                    aria-live="polite"
                    className={`flex items-center gap-2 text-sm font-medium rounded-md px-3 py-2 ${
                      isBalanced
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : totalDebit === 0 && totalCredit === 0
                          ? "bg-muted text-muted-foreground border border-border"
                          : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    {isBalanced ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    )}
                    {isBalanced
                      ? t("je.balanced")
                      : totalDebit === 0 && totalCredit === 0
                        ? "Enter amounts to begin"
                        : `${t("je.unbalanced")} — difference: ${formatNum(diff)}`}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
