"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import {
  AGAIN_FORM_RECORD_TITLE_CLASS,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import {
  ChequeLeafStatusBadge,
  chequeRangeLabel,
} from "@/components/finance/cheque-book-status";
import {
  deleteChequeBook,
  deleteUnusedChequeBookLeaves,
  fetchChequeBook,
  fetchPaymentAccounts,
  generateChequeBookLeaves,
  setChequeBookState,
  updateChequeBook,
  voidChequeLeaf,
  type ApiChequeBook,
  type ApiChequeBookDetail,
  type ApiFinancePaymentAccount,
  type ChequeBookState,
  type ChequeLeafDisplayStatus,
} from "@/lib/api/finance";
import { BD_BANKS } from "@/lib/finance/bd-banks";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type Form = {
  payment_account_id: string;
  bank_name: string;
  branch_name: string;
  routing_number: string;
  cheque_prefix: string;
  number_from: string;
  number_to: string;
  remarks: string;
};

type DraftValues = { form: Form; scrollTop: number };

function toForm(book: ApiChequeBookDetail): Form {
  return {
    payment_account_id: book.payment_account_id,
    bank_name: book.bank_name,
    branch_name: book.branch_name ?? "",
    routing_number: book.routing_number ?? "",
    cheque_prefix: book.cheque_prefix,
    number_from: String(book.number_from),
    number_to: String(book.number_to),
    remarks: book.remarks ?? "",
  };
}

const digits = (value: string) => value.replace(/\D/g, "");

type LeafFilter = "all" | "unused" | "issued" | "cleared";

const LEAF_FILTERS: { id: LeafFilter; label: string; match: (status: ChequeLeafDisplayStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "unused", label: "Unused", match: (s) => s === "unused" },
  { id: "issued", label: "Not treated", match: (s) => s === "not_treated" },
  { id: "cleared", label: "Cleared", match: (s) => s === "cleared" },
];

type Props = {
  bookId: string | null;
  /** The list row of that book: the drawer paints from it at once and loads the cheques behind it (nothing blank, no "Loading…"). */
  summary?: ApiChequeBook | null;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  /** The book or its cheques changed (or the book was deleted): reload the list behind the drawer. */
  onChanged: () => void;
};

/**
 * One cheque book in the common drawer (docs/common/drawercommon.md): actions on top, drag the left edge to resize, opens at 60% of
 * the screen, and anything typed but not saved is kept as a draft when the drawer is closed by accident.
 */
export function ChequeBookDetailDrawer({ bookId, summary, canWrite, onOpenChange, onChanged }: Props) {
  const [detail, setDetail] = React.useState<ApiChequeBookDetail | null>(null);
  const [form, setForm] = React.useState<Form | null>(null);
  const [accounts, setAccounts] = React.useState<ApiFinancePaymentAccount[]>([]);
  const [working, setWorking] = React.useState(false);
  const [filter, setFilter] = React.useState<LeafFilter>("all");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pendingScroll = React.useRef<number | null>(null);

  const apply = React.useCallback((next: ApiChequeBookDetail) => {
    setDetail(next);
    setForm(toForm(next));
  }, []);

  // the list row stands in for the book until its cheques arrive, so the drawer is never an empty page
  const summaryBook = React.useMemo<ApiChequeBookDetail | null>(
    () => (summary && bookId && summary.id === bookId ? { ...summary, leaves: [] } : null),
    [summary, bookId],
  );
  const book = detail ?? summaryBook;
  const loadingDetail = Boolean(bookId) && !detail;
  const busy = working || loadingDetail;

  React.useEffect(() => {
    setDetail(null);
    setForm(summaryBook ? toForm(summaryBook) : null);
    setFilter("all");
    if (!bookId) return;
    let cancelled = false;
    fetchChequeBook(bookId)
      .then((res) => !cancelled && apply(res.data))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the cheque book"));
    fetchPaymentAccounts()
      .then((res) => !cancelled && setAccounts(res.data))
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start from the list row when another book opens, not when the list reloads
  }, [bookId, apply]);

  const dirty = React.useMemo(() => {
    if (!book || !form) return false;
    const saved = toForm(book);
    return (Object.keys(saved) as (keyof Form)[]).some((key) => saved[key] !== form[key]);
  }, [book, form]);

  // closed by accident (outside click, Esc, X) -> the typed values and scroll position are kept for the next open
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<DraftValues>({
    key: bookId ? `cheque-book:${bookId}` : null,
    ready: Boolean(detail && form),
    dirty,
    getValues: () => ({ form: form as Form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => book && setForm(toForm(book)),
    label: "cheque book",
  });

  // after a draft is put back, return to where the user was
  React.useEffect(() => {
    if (pendingScroll.current == null || !form) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  const handleOpenChange = (open: boolean) => {
    if (!open) saveDraftIfDirty();
    onOpenChange(open);
  };

  async function run(fn: () => Promise<string | void>) {
    setWorking(true);
    try {
      const message = await fn();
      if (message) toast.success(message);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  const closed = book?.state === "closed";
  const editable = canWrite && !closed;
  // the numbers and bank are fixed once cheques exist (Delete Unused first to change them)
  const numbersLocked = (book?.leaf_count ?? 0) > 0 || (book?.leaves.length ?? 0) > 0;
  const set = (key: keyof Form) => (value: string) => form && setForm({ ...form, [key]: value });

  const counts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const leaf of book?.leaves ?? []) out[leaf.display_status] = (out[leaf.display_status] ?? 0) + 1;
    return out;
  }, [book]);

  const shownLeaves = React.useMemo(() => {
    const match = LEAF_FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    return (book?.leaves ?? []).filter((leaf) => match(leaf.display_status));
  }, [book, filter]);

  function save() {
    if (!form || !bookId) return;
    void run(async () => {
      apply(
        (
          await updateChequeBook(bookId, {
            payment_account_id: form.payment_account_id,
            bank_name: form.bank_name.trim(),
            branch_name: form.branch_name.trim() || null,
            routing_number: form.routing_number.trim() || null,
            cheque_prefix: form.cheque_prefix.trim(),
            number_from: Number(form.number_from),
            number_to: Number(form.number_to),
            remarks: form.remarks.trim() || null,
          })
        ).data,
      );
      clearDraft();
      return "Saved";
    });
  }

  function discard() {
    if (!book) return;
    clearDraft();
    setForm(toForm(book));
  }

  function generate() {
    if (!bookId) return;
    void run(async () => {
      const res = await generateChequeBookLeaves(bookId);
      apply(res.data);
      return res.count ? `${res.count} cheque${res.count === 1 ? "" : "s"} generated` : "All cheques of this book already exist";
    });
  }

  function removeUnused() {
    if (!bookId || !window.confirm("Delete every unused cheque of this book? Issued and void cheques stay.")) return;
    void run(async () => {
      const res = await deleteUnusedChequeBookLeaves(bookId);
      apply(res.data);
      return `${res.count} unused cheque${res.count === 1 ? "" : "s"} deleted`;
    });
  }

  function changeState(state: ChequeBookState) {
    if (!bookId) return;
    void run(async () => {
      apply((await setChequeBookState(bookId, state)).data);
      return `Cheque book is now ${state}`;
    });
  }

  function toggleVoid(leafId: string, voided: boolean) {
    void run(async () => {
      apply((await voidChequeLeaf(leafId, voided)).data);
    });
  }

  function removeBook() {
    if (!bookId || !window.confirm(`Delete cheque book ${book?.book_number}? This cannot be undone.`)) return;
    void run(async () => {
      await deleteChequeBook(bookId);
      clearDraft();
      onOpenChange(false);
      return "Cheque book deleted";
    });
  }

  const bankOptions = (form && form.bank_name && !BD_BANKS.includes(form.bank_name) ? [form.bank_name, ...BD_BANKS] : BD_BANKS).map((bank) => ({
    value: bank,
    label: bank,
  }));
  const fieldsOff = !editable || busy;
  const numbersOff = fieldsOff || numbersLocked;

  return (
    <AgainDrawerPanel
      open={Boolean(bookId)}
      onOpenChange={handleOpenChange}
      title="Cheque book"
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-cheque-book-drawer-width"
    >
      <AgainDrawerLayout>
        {/* actions stay on top, outside the scrolling body */}
        <AgainDrawerControlBar
          trailing={
            <>
              {canWrite && book ? (
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-none text-red-600" aria-label="Delete cheque book" title="Delete cheque book" onClick={removeBook} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />
            </>
          }
        >
          {canWrite && book && form ? (
            dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton onClick={discard} disabled={busy}>
                  Discard
                </AgainDrawerButton>
              </>
            ) : (
              <>
                {!closed ? (
                  <>
                    <AgainDrawerButton variant="success" onClick={generate} disabled={busy}>
                      Generate Cheques
                    </AgainDrawerButton>
                    <AgainDrawerButton variant="danger" onClick={removeUnused} disabled={busy || !book.unused_count}>
                      Delete Unused
                    </AgainDrawerButton>
                  </>
                ) : null}
                {book.state === "draft" ? (
                  <AgainDrawerButton onClick={() => changeState("active")} disabled={busy || book.leaf_count === 0}>
                    Activate
                  </AgainDrawerButton>
                ) : null}
                {book.state === "active" ? (
                  <AgainDrawerButton onClick={() => changeState("closed")} disabled={busy}>
                    Close book
                  </AgainDrawerButton>
                ) : null}
                {closed ? (
                  <AgainDrawerButton onClick={() => changeState("active")} disabled={busy}>
                    Reopen
                  </AgainDrawerButton>
                ) : null}
                {book.state === "active" && book.unused_count === book.leaf_count ? (
                  <AgainDrawerButton onClick={() => changeState("draft")} disabled={busy}>
                    Back to draft
                  </AgainDrawerButton>
                ) : null}
              </>
            )
          ) : null}
          {book ? (
            <AgainDrawerSwitch
              label="Cheque book state"
              value={book.state}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "closed", label: "Closed" },
              ]}
            />
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!book || !form ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-16 w-full rounded" />
              <div className="fb-shimmer h-40 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{book.book_number}</h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {book.bank_name} · {chequeRangeLabel(book.cheque_prefix, book.number_from, book.number_to)}
                  </p>
                </div>
              </div>

              {dirty ? (
                <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-700 dark:text-amber-300">
                  Unsaved changes. Close the drawer and they are kept as a draft; Save to apply them.
                </p>
              ) : null}

              {/* counts double as leaf filters */}
              <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
                {[
                  { id: "all" as const, label: "Cheques", value: book.leaf_count },
                  { id: "unused" as const, label: "Unused", value: loadingDetail ? book.unused_count : (counts.unused ?? 0) },
                  { id: "issued" as const, label: "Not treated", value: loadingDetail ? "–" : (counts.not_treated ?? 0) },
                  { id: "cleared" as const, label: "Cleared", value: loadingDetail ? "–" : (counts.cleared ?? 0) },
                ].map((stat) => (
                  <button
                    key={stat.id}
                    type="button"
                    onClick={() => setFilter(stat.id)}
                    className={cn(
                      "border bg-background px-3 py-2 text-left transition-colors hover:border-primary/60",
                      filter === stat.id ? "border-primary" : "border-border/70",
                    )}
                  >
                    <div className="text-lg font-semibold tabular-nums leading-tight">{stat.value}</div>
                    <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                  </button>
                ))}
              </div>

              <section>
                <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank details</h3>
                <div className="grid gap-x-8 @xl:grid-cols-2">
                  <AgainFormRow label="Bank account">
                    <FilterSelect
                      value={form.payment_account_id}
                      onChange={set("payment_account_id")}
                      options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                      searchThreshold={0}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Bank account"
                      disabled={numbersOff}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Bank">
                    <FilterSelect
                      value={form.bank_name}
                      onChange={set("bank_name")}
                      options={bankOptions}
                      searchThreshold={0}
                      searchPlaceholder="Search bank…"
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Bank"
                      disabled={numbersOff}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Branch">
                    <AgainUnderlineInput value={form.branch_name} onChange={set("branch_name")} readOnly={fieldsOff} placeholder="Branch name" />
                  </AgainFormRow>
                  <AgainFormRow label="Routing no.">
                    <AgainUnderlineInput value={form.routing_number} onChange={set("routing_number")} readOnly={fieldsOff} placeholder="Routing number" />
                  </AgainFormRow>
                </div>
              </section>

              <section>
                <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cheque numbers</h3>
                <div className="grid gap-x-8 @xl:grid-cols-3">
                  <AgainFormRow label="Initial">
                    <AgainUnderlineInput value={form.cheque_prefix} onChange={set("cheque_prefix")} readOnly={numbersOff} placeholder="e.g. 4545" />
                  </AgainFormRow>
                  <AgainFormRow label="From">
                    <AgainUnderlineInput value={form.number_from} onChange={(v) => set("number_from")(digits(v))} readOnly={numbersOff} />
                  </AgainFormRow>
                  <AgainFormRow label="To">
                    <AgainUnderlineInput value={form.number_to} onChange={(v) => set("number_to")(digits(v))} readOnly={numbersOff} />
                  </AgainFormRow>
                </div>
                {numbersLocked ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Cheques are generated, so the account, bank and numbers are fixed. Use Delete Unused first to change them.
                  </p>
                ) : null}
                <AgainFormRow label="Remarks" className="mt-1">
                  <AgainUnderlineTextarea value={form.remarks} onChange={set("remarks")} readOnly={fieldsOff} rows={2} />
                </AgainFormRow>
              </section>

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cheque leaves ({shownLeaves.length}
                    {filter !== "all" ? ` of ${book.leaf_count}` : ""})
                  </h3>
                  <div className="flex gap-1 text-[11px]">
                    {LEAF_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        className={cn("px-2 py-0.5", filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto bg-background">
                  <table className="w-full min-w-[620px] border-collapse text-[12px]">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 font-medium">Cheque no.</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Issue date</th>
                        <th className="px-2 py-1.5 font-medium">Supplier</th>
                        <th className="px-2 py-1.5 font-medium">Payment</th>
                        <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                        <th className="w-14 px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {shownLeaves.map((leaf) => (
                        <tr key={leaf.id} className="border-b border-border/60" title={leaf.remarks ?? undefined}>
                          <td className="px-2 py-1.5 font-medium tabular-nums">{leaf.cheque_number}</td>
                          <td className="px-2 py-1.5">
                            <ChequeLeafStatusBadge status={leaf.display_status} />
                          </td>
                          <td className="px-2 py-1.5">{leaf.issue_date ? formatDate(leaf.issue_date) : ""}</td>
                          <td className="px-2 py-1.5">{leaf.party_name ?? ""}</td>
                          <td className="px-2 py-1.5">{leaf.payment_number ?? ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{leaf.cheque_id ? formatCurrency(Number(leaf.amount)) : ""}</td>
                          <td className="px-2 py-1.5 text-right">
                            {editable && leaf.status === "unused" ? (
                              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => toggleVoid(leaf.id, true)} disabled={busy}>
                                Void
                              </button>
                            ) : null}
                            {editable && leaf.status === "void" ? (
                              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => toggleVoid(leaf.id, false)} disabled={busy}>
                                Restore
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {loadingDetail
                        ? [0, 1, 2, 3].map((i) => (
                            <tr key={`sk-${i}`} className="border-b border-border/60" aria-hidden>
                              <td colSpan={7} className="px-2 py-1.5">
                                <div className="fb-shimmer h-5 w-full rounded" />
                              </td>
                            </tr>
                          ))
                        : null}
                      {!loadingDetail && !shownLeaves.length ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground">
                            {book.leaf_count ? "No cheques match this filter." : "No cheques yet. Click Generate Cheques to create one for each number."}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
