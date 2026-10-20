"use client";

import { useCallback, useEffect, useRef } from "react";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { cn } from "@/lib/utils";

/** Again form sheet field palette — matches Sales order drawer; follows light/dark CSS vars. */
export const againFormSheet = {
  label: "var(--foreground)",
  value: "var(--foreground)",
  help: "var(--muted-foreground)",
  border: "var(--input)",
  accent: "#00a09d",
} as const;

/** Record title inside drawer body (e.g. QUO-00009). */
export const AGAIN_FORM_TITLE_CLASS =
  "text-[28px] font-bold leading-tight tracking-tight text-foreground";

/** Slightly smaller editable record title (articles, partners). */
export const AGAIN_FORM_RECORD_TITLE_CLASS =
  "text-[22px] font-bold leading-tight tracking-tight text-foreground";

/** Shared label column width — all rows align (Again form sheet). */
export const AGAIN_FORM_ROW_GRID_CLASS = "grid-cols-[7.5rem_minmax(0,1fr)]";

/** Label left · control right (Again again_group / again_wrap_label + again_wrap_input). */
export function AgainFormRow({
  label,
  help,
  children,
  className,
}: {
  label: React.ReactNode;
  help?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-x-2 py-[3px]",
        AGAIN_FORM_ROW_GRID_CLASS,
        className,
      )}
    >
      <div
        className="flex min-h-[28px] items-center gap-1 text-[13px] leading-[1.3]"
        style={{ color: againFormSheet.label }}
      >
        <span className="font-normal">{label}</span>
        {help ? <FieldHelpTip label={help} /> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Bottom underline — gray at rest; teal (#00a09d) on focus (color only, via box-shadow in globals.css). */
export function AgainUnderlineField({
  readOnly,
  active,
  className,
  children,
}: {
  readOnly?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-again-underline-field=""
      data-readonly={readOnly ? "true" : undefined}
      data-active={!readOnly && active ? "true" : undefined}
      className={cn("min-h-[28px] pb-px", className)}
    >
      {children}
    </div>
  );
}

export function AgainFormPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[13px] leading-[1.3]" style={{ color: againFormSheet.help }}>
      {children}
    </span>
  );
}

/** Standard underline text input — gray underline at rest; teal on click/focus. */
export function AgainUnderlineInput({
  value,
  onChange,
  readOnly,
  placeholder,
  className,
  inputClassName,
  active,
  onKeyDown,
  onFocus,
  onBlur,
  autoComplete,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  active?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  autoComplete?: string;
}) {
  return (
    <AgainUnderlineField readOnly={readOnly} active={active} className={className}>
      {readOnly ? (
        <p
          className={cn("min-h-[28px] py-1 text-[13px] leading-[1.3]", inputClassName)}
          style={{ color: againFormSheet.value }}
        >
          {value || (placeholder ? <AgainFormPlaceholder>{placeholder}</AgainFormPlaceholder> : "—")}
        </p>
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={cn(
            "h-8 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70",
            inputClassName,
          )}
        />
      )}
    </AgainUnderlineField>
  );
}

/** Underline select — same focus accent as text inputs. */
export function AgainUnderlineSelect({
  id,
  value,
  onChange,
  readOnly,
  active,
  className,
  children,
}: {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <AgainUnderlineField readOnly={readOnly} active={active} className={className}>
      {readOnly ? (
        <p
          className="flex h-[28px] items-center text-[13px] leading-[1.3]"
          style={{ color: againFormSheet.value }}
        >
          {value || "—"}
        </p>
      ) : (
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="h-[28px] w-full appearance-none bg-transparent text-[13px] leading-[1.3] text-foreground outline-none"
          style={{ color: againFormSheet.value }}
        >
          {children}
        </select>
      )}
    </AgainUnderlineField>
  );
}

/** Underline textarea — same focus accent as text inputs. */
export function AgainUnderlineTextarea({
  id,
  value,
  onChange,
  readOnly,
  rows = 4,
  placeholder,
  active,
  className,
}: {
  id?: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <AgainUnderlineField
      readOnly={readOnly}
      active={active}
      className={cn("min-h-[72px]", className)}
    >
      {readOnly ? (
        <p
          className="whitespace-pre-wrap py-1 text-[13px] leading-[1.45]"
          style={{ color: againFormSheet.value }}
        >
          {value || "—"}
        </p>
      ) : (
        <textarea
          id={id}
          value={value ?? ""}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full resize-y bg-transparent py-1 text-[13px] leading-[1.45] text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      )}
    </AgainUnderlineField>
  );
}

/** Large editable record title — partner name / article title style with underline accent. */
export function AgainFormRecordTitle({
  value,
  onChange,
  readOnly,
  placeholder = "Untitled",
  className,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <AgainUnderlineField readOnly={readOnly} className={className}>
      {readOnly ? (
        <h1 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, "py-0.5")}>{value.trim() || placeholder}</h1>
      ) : (
        <textarea
          ref={ref}
          value={value}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => {
            onChange?.(e.target.value);
            syncHeight();
          }}
          className={cn(
            AGAIN_FORM_RECORD_TITLE_CLASS,
            "w-full resize-none overflow-hidden bg-transparent py-0.5 outline-none placeholder:text-muted-foreground/45",
          )}
        />
      )}
    </AgainUnderlineField>
  );
}


/**
 * Odoo form group title: small uppercase heading with a rule under it. Use between groups of fields
 * (docs/common/formcommon.md). In a two-column grid pass `className="@xl:col-span-2"` so it spans both.
 */
export function AgainFormGroupTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("mb-1 mt-2 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </h3>
  );
}

/**
 * Odoo form row for the big record forms: label on the left (13 px), control on the right. Put the rows in a
 * `.again-odoo-form` container (globals.css) so every text control becomes an underline, teal on focus.
 * Two columns by the drawer's own width: `grid gap-x-8 @xl:grid-cols-2` inside an `@container`.
 * `hint` is a one-line note under the control; `required` adds the red star.
 */
export function AgainFormField({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-2 py-[3px]", className)}>
      <label className="flex min-h-[28px] items-center text-[13px] font-normal leading-[1.3] text-foreground">
        <span>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </span>
      </label>
      <div className="min-w-0">
        {children}
        {hint ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
