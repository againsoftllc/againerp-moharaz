"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Link2, Mail, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { LedgerStatementDocument } from "@/components/finance/ledger-statement-document";
import { WhatsAppIcon } from "@/components/customers/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import { whatsappChatUrl } from "@/lib/customers/whatsapp";
import {
  createLedgerStatementShareLink,
  downloadLedgerStatementHtml,
  ledgerStatementShareMessage,
} from "@/lib/finance/ledger-share";
import {
  EMPTY_LEDGER_PRINT_COMPANY,
  ledgerPrintCompanyFromWorkspace,
  type LedgerPrintCompany,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";

type Props = {
  statement: LedgerStatement;
  onClose: () => void;
};

export function LedgerStatementPrintOverlay({ statement, onClose }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [company, setCompany] = useState<LedgerPrintCompany | null>(null);
  const shareUrlRef = useRef<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const whatsappUrl = whatsappChatUrl(statement.partyPhone || "");

  async function ensureShareUrl(): Promise<string> {
    if (shareUrlRef.current) return shareUrlRef.current;
    if (!company) throw new Error("Statement is still preparing");
    const url = await createLedgerStatementShareLink(statement, company);
    shareUrlRef.current = url;
    return url;
  }

  async function copyShareLink() {
    setShareBusy(true);
    try {
      const url = await ensureShareUrl();
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy share link");
    } finally {
      setShareBusy(false);
    }
  }

  function downloadHtml() {
    const root = document.getElementById("ledger-print-area");
    if (!root) {
      toast.error("Statement is still preparing");
      return;
    }
    downloadLedgerStatementHtml(root, statement);
    toast.success("Statement downloaded");
  }

  async function sendEmail() {
    const email = statement.partyEmail?.trim();
    if (!email) {
      toast.error("No email on this account");
      return;
    }
    setShareBusy(true);
    try {
      const url = await ensureShareUrl();
      const subject = `Account statement — ${statement.partyName}`;
      const body = ledgerStatementShareMessage(statement, url);
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open email");
    } finally {
      setShareBusy(false);
    }
  }

  async function sendWhatsApp() {
    if (!whatsappUrl) return;
    setShareBusy(true);
    try {
      const url = await ensureShareUrl();
      const text = ledgerStatementShareMessage(statement, url);
      window.open(`${whatsappUrl}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open WhatsApp");
    } finally {
      setShareBusy(false);
    }
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPointer = document.body.style.pointerEvents;
    document.body.style.overflow = "hidden";
    document.body.style.pointerEvents = "auto";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    let cancelled = false;
    void fetchWorkspaceCompany()
      .then((row) => {
        if (!cancelled) setCompany(ledgerPrintCompanyFromWorkspace(row));
      })
      .catch(() => {
        if (!cancelled) setCompany(EMPTY_LEDGER_PRINT_COMPANY);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
      document.body.style.pointerEvents = prevPointer;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Customer/supplier ledger opens from a Sheet. Radix RemoveScroll preventDefault's
  // wheel/touch outside that sheet, so this body portal cannot scroll natively.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let touchY = 0;

    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node)) return;
      const before = el.scrollTop;
      window.requestAnimationFrame(() => {
        if (el.scrollTop === before) el.scrollTop = before + e.deltaY;
      });
    };
    const onTouchStart = (e: TouchEvent) => {
      if (!el.contains(e.target as Node)) return;
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!el.contains(e.target as Node)) return;
      const y = e.touches[0]?.clientY ?? touchY;
      const dy = touchY - y;
      touchY = y;
      const before = el.scrollTop;
      window.requestAnimationFrame(() => {
        if (el.scrollTop === before) el.scrollTop = before + dy;
      });
    };

    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    return () => {
      document.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, [ready]);

  return createPortal(
    <div
      data-ledger-print-overlay
      className="pointer-events-auto fixed inset-0 z-[250] flex flex-col bg-[#ececec] dark:bg-background"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="print-hide flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={() => onCloseRef.current()}
        >
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={!ready || !company || shareBusy}
            onClick={() => void copyShareLink()}
          >
            <Link2 className="mr-1.5 h-4 w-4" />
            Share link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={!ready || !company}
            onClick={downloadHtml}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            disabled={!ready || !company || shareBusy}
            onClick={() => void sendEmail()}
          >
            <Mail className="mr-1.5 h-4 w-4" />
            Email
          </Button>
          {whatsappUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none"
              disabled={!ready || !company || shareBusy}
              onClick={() => void sendWhatsApp()}
            >
              <WhatsAppIcon className="mr-1.5 h-4 w-4" />
              WhatsApp
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="rounded-none"
            disabled={!ready}
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        tabIndex={0}
        className="h-0 min-h-0 flex-1 overflow-y-scroll overscroll-contain p-4 print:h-auto print:overflow-visible print:p-0 sm:p-6"
      >
        <div id="ledger-print-area" className="mx-auto max-w-[820px]">
          {ready && company ? (
            <LedgerStatementDocument statement={statement} company={company} />
          ) : (
            <div className="bg-white px-10 py-16 text-center text-sm text-[#6c757d]">
              Preparing statement…
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
