"use client";

import { useEffect, type RefObject } from "react";
import { formatGroupedQuantity } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";

type PagerState = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

function setText(el: Element | null, value: string) {
  if (!el) return;
  if (el.textContent !== value) el.textContent = value;
}

function setDisabled(btn: Element | null, disabled: boolean) {
  if (!btn) return;
  btn.classList.toggle("ag-disabled", disabled);
  if (disabled) btn.setAttribute("aria-disabled", "true");
  else btn.removeAttribute("aria-disabled");
}

function buttonForIcon(panel: Element, icon: string) {
  return panel.querySelector(`.${icon}`)?.closest(".ag-paging-button") ?? null;
}

/** Keep AG Grid’s native footer, but drive pages from the server. */
export function useAgNativeServerPager(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  state: PagerState,
) {
  const { total, page, pageSize, onPageChange } = state;

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const pageCount = Math.max(1, Math.ceil((total || 1) / pageSize));
    const lastPage = Math.max(0, pageCount - 1);
    const from = total === 0 ? 0 : page * pageSize + 1;
    const to = Math.min(total, (page + 1) * pageSize);
    const atStart = page <= 0 || total === 0;
    const atEnd = page >= lastPage || total === 0;

    const apply = () => {
      const panel = root.querySelector(".ag-paging-panel");
      if (!panel) return;
      setText(panel.querySelector('[id$="-first-row"]'), String(from));
      setText(panel.querySelector('[id$="-last-row"]'), String(to));
      setText(panel.querySelector('[id$="-row-count"]'), formatGroupedQuantity(total, getCompanyFormat()));
      setText(panel.querySelector('[id$="-start-page-number"]'), String(page + 1));
      setText(panel.querySelector('[id$="-of-page-number"]'), String(pageCount));
      setDisabled(buttonForIcon(panel, "ag-icon-first"), atStart);
      setDisabled(buttonForIcon(panel, "ag-icon-previous"), atStart);
      setDisabled(buttonForIcon(panel, "ag-icon-next"), atEnd);
      setDisabled(buttonForIcon(panel, "ag-icon-last"), atEnd);
    };

    const attach = () => {
      apply();
      const panel = root.querySelector(".ag-paging-panel");
      return panel;
    };

    apply();
    const raf = window.requestAnimationFrame(apply);

    let watched: Element | null = null;
    let panelObserver: MutationObserver | null = null;
    const watchPanel = (panel: Element) => {
      if (watched === panel) return;
      watched = panel;
      panelObserver?.disconnect();
      panelObserver = new MutationObserver(() => apply());
      panelObserver.observe(panel, { childList: true, subtree: true, characterData: true });
    };

    const existing = attach();
    if (existing) watchPanel(existing);

    const rootObserver = new MutationObserver(() => {
      const panel = root.querySelector(".ag-paging-panel");
      if (panel) {
        apply();
        watchPanel(panel);
      }
    });
    rootObserver.observe(root, { childList: true, subtree: true });

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const btn = target?.closest(".ag-paging-button");
      if (!btn || !root.contains(btn)) return;
      const icon = btn.querySelector(".ag-icon");
      let next = page;
      if (icon?.classList.contains("ag-icon-first")) next = 0;
      else if (icon?.classList.contains("ag-icon-previous")) next = page - 1;
      else if (icon?.classList.contains("ag-icon-next")) next = page + 1;
      else if (icon?.classList.contains("ag-icon-last")) next = lastPage;
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (btn.classList.contains("ag-disabled")) return;
      if (next === page || next < 0 || next > lastPage) return;
      onPageChange(next);
    };
    root.addEventListener("click", onClick, true);

    return () => {
      window.cancelAnimationFrame(raf);
      panelObserver?.disconnect();
      rootObserver.disconnect();
      root.removeEventListener("click", onClick, true);
    };
  }, [enabled, rootRef, total, page, pageSize, onPageChange]);
}
