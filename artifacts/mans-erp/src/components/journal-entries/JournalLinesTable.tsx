import { useLanguage } from "@/lib/language-provider";
import { jt } from "@/lib/journal-entry-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
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
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  onUpdateLine: (key: string, field: keyof LineState, value: string) => void;
  onSetLineAccount: (key: string, accountId: string, accountLabel: string) => void;
  showErrors?: boolean;
  disabled?: boolean;
}

/**
 * Editable journal lines. Desktop: compact table (scrolls inside its own box).
 * Mobile: stacked cards, so the page never overflows horizontally.
 * Line description edits the line's descriptionEn (descriptionAr is preserved).
 */
export function JournalLinesTable({
  lines,
  accounts,
  costCenters,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onSetLineAccount,
  showErrors,
  disabled,
}: JournalLinesTableProps) {
  const { t, lang } = useLanguage();
  const canRemove = lines.length > 2;
  const ccName = (cc: CostCenterOption) =>
    lang === "ar" ? cc.nameAr || cc.nameEn : cc.nameEn || cc.nameAr;

  const setAmount = (key: string, field: "debit" | "credit", v: string) => {
    onUpdateLine(key, field, v);
    if (v) onUpdateLine(key, field === "debit" ? "credit" : "debit", "");
  };

  const fields = (line: LineState, idx: number) => ({
    account: (
      <AccountPicker
        id={`line-account-${idx + 1}`}
        value={line.accountId}
        onChange={(id, label) => onSetLineAccount(line._key, id, label)}
        accounts={accounts}
        placeholder={jt(lang, "selectAccount")}
        fallbackLabel={line.accountLabel}
        invalid={showErrors && !line.accountId}
      />
    ),
    description: (
      <Input
        aria-label={`${jt(lang, "line")} ${idx + 1} ${jt(lang, "description")}`}
        data-testid={`input-line-description-${idx + 1}`}
        dir="auto"
        value={line.descriptionEn}
        onChange={(e) => onUpdateLine(line._key, "descriptionEn", e.target.value)}
        placeholder={line.descriptionAr || jt(lang, "description")}
        className="h-10"
        disabled={disabled}
      />
    ),
    costCenter: (
      <Select
        value={line.costCenterId || "_none"}
        onValueChange={(v) => onUpdateLine(line._key, "costCenterId", v === "_none" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger
          className="h-10"
          aria-label={`${jt(lang, "line")} ${idx + 1} ${jt(lang, "costCenter")}`}
          data-testid={`select-line-costcenter-${idx + 1}`}
        >
          <SelectValue placeholder={jt(lang, "none")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">{jt(lang, "none")}</SelectItem>
          {costCenters.map((cc) => (
            <SelectItem key={cc.id} value={cc.id}>
              {cc.code} — {ccName(cc)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    reference: (
      <Input
        aria-label={`${jt(lang, "line")} ${idx + 1} ${jt(lang, "lineReference")}`}
        data-testid={`input-line-reference-${idx + 1}`}
        value={line.reference}
        onChange={(e) => onUpdateLine(line._key, "reference", e.target.value)}
        placeholder={jt(lang, "optional")}
        className="h-10"
        disabled={disabled}
      />
    ),
    debit: (
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        aria-label={`${jt(lang, "line")} ${idx + 1} ${jt(lang, "debit")}`}
        data-testid={`input-line-debit-${idx + 1}`}
        value={line.debit}
        onChange={(e) => setAmount(line._key, "debit", e.target.value)}
        placeholder="0.00"
        dir="ltr"
        className="h-10 text-end font-mono tabular-nums"
        disabled={disabled}
      />
    ),
    credit: (
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        aria-label={`${jt(lang, "line")} ${idx + 1} ${jt(lang, "credit")}`}
        data-testid={`input-line-credit-${idx + 1}`}
        value={line.credit}
        onChange={(e) => setAmount(line._key, "credit", e.target.value)}
        placeholder="0.00"
        dir="ltr"
        className="h-10 text-end font-mono tabular-nums"
        disabled={disabled}
      />
    ),
    remove: (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={() => onRemoveLine(line._key)}
        disabled={!canRemove || disabled}
        title={canRemove ? jt(lang, "removeLine") : jt(lang, "minLines")}
        aria-label={`${jt(lang, "removeLine")} ${idx + 1}`}
        data-testid={`button-remove-line-${idx + 1}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    ),
  });

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="je-lines-title">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="je-lines-title" className="font-semibold">{t("je.lines")}</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length} · {jt(lang, "minLines")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0" onClick={onAddLine} disabled={disabled} data-testid="button-add-line">
          <Plus className="h-4 w-4" />
          {jt(lang, "addLine")}
        </Button>
      </header>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="text-start font-medium py-2 px-3 w-10">#</th>
              <th className="text-start font-medium py-2 px-2 min-w-[240px]">{jt(lang, "account")} *</th>
              <th className="text-start font-medium py-2 px-2 min-w-[180px]">{jt(lang, "description")}</th>
              <th className="text-start font-medium py-2 px-2 min-w-[150px]">{jt(lang, "costCenter")}</th>
              <th className="text-start font-medium py-2 px-2 min-w-[110px]">{jt(lang, "lineReference")}</th>
              <th className="text-end font-medium py-2 px-2 min-w-[120px]">{jt(lang, "debit")}</th>
              <th className="text-end font-medium py-2 px-2 min-w-[120px]">{jt(lang, "credit")}</th>
              <th className="py-2 px-2 w-12"><span className="sr-only">{jt(lang, "removeLine")}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const f = fields(line, idx);
              return (
                <tr key={line._key} className="border-b last:border-0 align-top hover:bg-muted/20" data-testid={`row-line-${idx + 1}`}>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono pt-5">{idx + 1}</td>
                  <td className="py-2 px-2">{f.account}</td>
                  <td className="py-2 px-2">{f.description}</td>
                  <td className="py-2 px-2">{f.costCenter}</td>
                  <td className="py-2 px-2">{f.reference}</td>
                  <td className="py-2 px-2">{f.debit}</td>
                  <td className="py-2 px-2">{f.credit}</td>
                  <td className="py-2 px-2 text-center">{f.remove}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ol className="md:hidden divide-y">
        {lines.map((line, idx) => {
          const f = fields(line, idx);
          return (
            <li key={line._key} className="p-4 space-y-3" data-testid={`card-line-${idx + 1}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">
                  {jt(lang, "line")} {idx + 1}
                </span>
                {f.remove}
              </div>
              {f.account}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 min-w-0">
                  <span className="text-xs text-muted-foreground">{jt(lang, "debit")}</span>
                  {f.debit}
                </label>
                <label className="space-y-1 min-w-0">
                  <span className="text-xs text-muted-foreground">{jt(lang, "credit")}</span>
                  {f.credit}
                </label>
              </div>
              {f.description}
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">{f.costCenter}</div>
                <div className="min-w-0">{f.reference}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t p-3">
        <Button type="button" variant="ghost" className="w-full gap-2 border border-dashed text-muted-foreground hover:text-primary" onClick={onAddLine} disabled={disabled} data-testid="button-add-line-bottom">
          <Plus className="h-4 w-4" />
          {jt(lang, "addLine")}
        </Button>
      </div>
    </section>
  );
}
