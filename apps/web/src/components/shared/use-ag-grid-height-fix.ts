"use client";

import { useEffect, type RefObject } from "react";

/**
 * Workaround: in some flex-layout contexts AG Grid's internal style wrapper
 * (the unclassed div directly inside `.ag-theme-quartz`) fails to resolve its
 * `height: 100%` against a flex-grown ancestor, collapsing the grid to just
 * its header row. Mirrors the ancestor's measured pixel height onto that
 * wrapper directly so percentage resolution isn't needed.
 */
export function useAgGridHeightFix(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyHeight = (height: number) => {
      const wrapper = container.querySelector<HTMLElement>(".ag-root-wrapper");
      const styleWrapper = wrapper?.parentElement;
      if (styleWrapper) {
        styleWrapper.style.height = `${Math.max(0, height)}px`;
        styleWrapper.style.minHeight = "0";
      }
      if (wrapper) {
        wrapper.style.height = "100%";
        wrapper.style.minHeight = "0";
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
      }
      const body = wrapper?.querySelector<HTMLElement>(".ag-root-wrapper-body");
      if (body) {
        body.style.flex = "1 1 auto";
        body.style.minHeight = "0";
        body.style.height = "auto";
      }
      const paging = wrapper?.querySelector<HTMLElement>(".ag-paging-panel");
      if (paging) {
        paging.style.flexShrink = "0";
        paging.style.height = "27px";
      }
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) applyHeight(entry.contentRect.height);
    });
    observer.observe(container);
    applyHeight(container.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, [containerRef]);
}
