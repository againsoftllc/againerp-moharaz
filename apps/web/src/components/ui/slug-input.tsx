"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { SLUG_INPUT_INVALID_CLASS, validateSlug } from "@/lib/url-slug/validate-slug";
import { cn } from "@/lib/utils";

type SlugInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "prefix"> & {
  value: string;
  onChange: (value: string) => void;
  excludeId?: string;
  urlPrefix?: React.ReactNode;
  suffix?: React.ReactNode;
  showMessage?: boolean;
  /** When set, also checks slug availability against the catalog products API. */
  apiTaken?: boolean;
  apiMessage?: string | null;
  apiChecking?: boolean;
};

export function SlugInput({
  value,
  onChange,
  excludeId,
  urlPrefix,
  suffix,
  showMessage = true,
  apiTaken = false,
  apiMessage,
  apiChecking = false,
  className,
  ...props
}: SlugInputProps) {
  const validation = validateSlug(value, excludeId ? { id: excludeId } : undefined);
  const invalid = (!!value.trim() && !validation.isValid) || apiTaken;

  const message =
    apiTaken && apiMessage
      ? apiMessage
      : validation.message;

  return (
    <div className="min-w-0">
      <div className={cn("flex items-center gap-1 text-sm", urlPrefix && "gap-1")}>
        {urlPrefix}
        <div className="relative min-w-0 flex-1">
          <Input
            {...props}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn("min-w-0 w-full", invalid && SLUG_INPUT_INVALID_CLASS, className)}
            aria-invalid={invalid}
          />
          {suffix}
        </div>
      </div>
      {showMessage && apiChecking && (
        <p className="mt-1 text-[10px] text-muted-foreground">Checking slug availability…</p>
      )}
      {showMessage && !apiChecking && invalid && message && (
        <p className="mt-1 text-[10px] text-destructive">{message}</p>
      )}
    </div>
  );
}

export function useSlugValidation(slug: string, excludeId?: string) {
  return React.useMemo(
    () => validateSlug(slug, excludeId ? { id: excludeId } : undefined),
    [slug, excludeId],
  );
}
