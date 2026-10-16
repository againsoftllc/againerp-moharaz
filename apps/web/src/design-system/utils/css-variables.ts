import type { CssVariableMap } from "../types";

/** Apply a token map to a DOM element (defaults to `document.documentElement`). */
export function applyCssVariables(
  variables: CssVariableMap,
  target: HTMLElement = document.documentElement,
): void {
  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }
}

/** Remove inline overrides for the given variable names. */
export function clearCssVariables(
  names: Array<keyof CssVariableMap>,
  target: HTMLElement = document.documentElement,
): void {
  for (const name of names) {
    target.style.removeProperty(name);
  }
}

/** Serialize token map to a `:root { ... }` CSS block (build-time / docs tooling). */
export function cssVariablesToBlock(
  variables: CssVariableMap,
  selector = ":root",
): string {
  const lines = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
  return `${selector} {\n${lines}\n}`;
}
