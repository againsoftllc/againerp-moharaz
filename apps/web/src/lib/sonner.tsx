"use client";

/**
 * App toast layer — adds a copy button to every toast message.
 * Imported as "sonner" via webpack alias in next.config.ts.
 */
import * as React from "react";
import { Check, Copy } from "lucide-react";
import {
  toast as baseToast,
  Toaster as SonnerToaster,
  type ExternalToast,
} from "sonner-core";

export { SonnerToaster as Toaster };
export type { ExternalToast };

function messageText(message: React.ReactNode): string {
  if (typeof message === "string") return message;
  if (typeof message === "number" || typeof message === "boolean") return String(message);
  if (message == null) return "";
  if (React.isValidElement(message)) {
    const props = message.props as { children?: React.ReactNode };
    if (typeof props.children === "string") return props.children;
  }
  return String(message);
}

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    );
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<boolean> {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}

function ToastBody({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!text) return;
      const ok = await copyText(text);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    },
    [text],
  );

  return (
    <div className="flex w-full min-w-0 items-start gap-2 pr-0.5">
      <span className="min-w-0 flex-1 break-words text-xs leading-snug">{text}</span>
      {text ? (
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy message"}
          title={copied ? "Copied" : "Copy message"}
          className="relative z-10 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={copy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function showToast(
  fn: (message: React.ReactNode, options?: ExternalToast) => string | number,
  message: React.ReactNode,
  options?: ExternalToast,
) {
  const text = messageText(message);
  const description =
    options?.description != null ? messageText(options.description) : undefined;
  const fullText = [text, description].filter(Boolean).join("\n");
  const merged: ExternalToast = {
    duration: 15000,
    ...options,
    description: undefined,
  };

  return fn(<ToastBody text={fullText || text} />, merged);
}

type ToastFn = typeof baseToast;

export const toast = Object.assign(
  (message: React.ReactNode, options?: ExternalToast) => showToast(baseToast, message, options),
  {
    success: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.success, message, options),
    error: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.error, message, options),
    info: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.info, message, options),
    warning: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.warning, message, options),
    message: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.message, message, options),
    loading: (message: React.ReactNode, options?: ExternalToast) =>
      showToast(baseToast.loading, message, options),
    promise: baseToast.promise.bind(baseToast),
    custom: baseToast.custom.bind(baseToast),
    dismiss: baseToast.dismiss.bind(baseToast),
  },
) as ToastFn;
