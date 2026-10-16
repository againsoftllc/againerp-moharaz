"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type Rect = { x: number; y: number; width: number; height: number };

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResizeEnd: () => void;
};

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function handlePosition(h: Handle): React.CSSProperties {
  const half = -4;
  const mid = "50%";
  const midOff = "calc(50% - 4px)";
  const map: Record<Handle, React.CSSProperties> = {
    nw: { top: half, left: half, cursor: "nw-resize" },
    n:  { top: half, left: midOff, cursor: "n-resize" },
    ne: { top: half, right: half, cursor: "ne-resize" },
    e:  { top: midOff, right: half, cursor: "e-resize" },
    se: { bottom: half, right: half, cursor: "se-resize" },
    s:  { bottom: half, left: midOff, cursor: "s-resize" },
    sw: { bottom: half, left: half, cursor: "sw-resize" },
    w:  { top: midOff, left: half, cursor: "w-resize" },
  };
  return map[h];
}

export function ImageResizeOverlay({ containerRef, onResizeEnd }: Props) {
  const [selected, setSelected] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const draggingRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    ar: number;
  } | null>(null);

  const computeRect = useCallback((img: HTMLImageElement): Rect | null => {
    const container = containerRef.current;
    if (!container) return null;
    const cRect = container.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    return {
      x: iRect.left - cRect.left + container.scrollLeft,
      y: iRect.top - cRect.top + container.scrollTop,
      width: iRect.width,
      height: iRect.height,
    };
  }, [containerRef]);

  const refresh = useCallback((img: HTMLImageElement) => {
    const r = computeRect(img);
    if (r) setRect(r);
  }, [computeRect]);

  // Deselect on scroll so position stays correct
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (selected) refresh(selected);
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef, selected, refresh]);

  // Click inside editor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
        setSelected(e.target);
        const r = computeRect(e.target);
        if (r) setRect(r);
      } else {
        setSelected(null);
        setRect(null);
      }
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [containerRef, computeRect]);

  // Keyboard delete selected image
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        selected.remove();
        setSelected(null);
        setRect(null);
        onResizeEnd();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, onResizeEnd]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selected) return;

    const startW = selected.offsetWidth || selected.naturalWidth || 300;
    const startH = selected.offsetHeight || selected.naturalHeight || 200;

    draggingRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW,
      startH,
      ar: startW / (startH || 1),
    };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !selected) return;
      const { handle: h, startX, startY, startW: sw, startH: sh, ar } = draggingRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let newW = sw;
      let newH = sh;
      const isCorner = h.length === 2;

      if (h.includes("e")) newW = Math.max(40, sw + dx);
      if (h.includes("w")) newW = Math.max(40, sw - dx);
      if (h.includes("s")) newH = Math.max(30, sh + dy);
      if (h.includes("n")) newH = Math.max(30, sh - dy);

      if (isCorner) {
        // Lock aspect ratio on corner drag — use width as primary
        newH = newW / ar;
      }

      selected.style.width = `${Math.round(newW)}px`;
      selected.style.height = isCorner ? `${Math.round(newH)}px` : `${Math.round(newH)}px`;
      const r = computeRect(selected);
      if (r) setRect(r);
    };

    const onUp = () => {
      draggingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      onResizeEnd();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [selected, computeRect, onResizeEnd]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
        outline: "2px solid hsl(var(--primary))",
        outlineOffset: 1,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          onMouseDown={(e) => onHandleMouseDown(e, h)}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            background: "hsl(var(--primary))",
            border: "1.5px solid white",
            borderRadius: 2,
            pointerEvents: "all",
            zIndex: 21,
            ...handlePosition(h),
          }}
        />
      ))}
    </div>
  );
}
