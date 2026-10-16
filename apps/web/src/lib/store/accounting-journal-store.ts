import { create } from "zustand";
import {
  demoWorkOrderJournalSeed,
} from "@/lib/mock-data/inventory-integration-seed";
import {
  journalTotals,
  type JournalEntry,
  type JournalLine,
  type JournalReferenceType,
} from "@/lib/mock-data/accounting-journal";

type PostJournalInput = {
  description: string;
  referenceType: JournalReferenceType;
  referenceId: string;
  referenceLabel: string;
  event: string;
  lines: Omit<JournalLine, "id">[];
};

type AccountingJournalStore = {
  entries: JournalEntry[];
  getByReference: (referenceType: JournalReferenceType, referenceId: string) => JournalEntry[];
  postEntry: (input: PostJournalInput) => JournalEntry | null;
};

let journalSeq = 8900;

export const useAccountingJournalStore = create<AccountingJournalStore>()((set, get) => ({
  entries: [...demoWorkOrderJournalSeed],

  getByReference: (referenceType, referenceId) =>
    get().entries.filter(
      (e) => e.referenceType === referenceType && e.referenceId === referenceId,
    ),

  postEntry: (input) => {
    const lines: JournalLine[] = input.lines.map((l, i) => ({
      ...l,
      id: `jl_${Date.now()}_${i}`,
    }));
    const { totalDebit, totalCredit } = journalTotals(lines);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return null;

    journalSeq += 1;
    const entry: JournalEntry = {
      id: `je_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      number: `JE-2026-${journalSeq}`,
      date: new Date().toISOString().slice(0, 10),
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceLabel: input.referenceLabel,
      event: input.event,
      status: "posted",
      lines,
      totalDebit,
      totalCredit,
    };

    set((s) => ({ entries: [entry, ...s.entries] }));
    return entry;
  },
}));
