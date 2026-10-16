export { lightCssVariables, lightSemanticColors, lightStatusColors, lightUiColors } from "./light";
export { darkCssVariables, darkSemanticColors, darkStatusColors, darkUiColors } from "./dark";

import type { CssVariableMap, ThemeMode } from "../types";
import { darkCssVariables } from "./dark";
import { lightCssVariables } from "./light";

export const themes: Record<ThemeMode, CssVariableMap> = {
  light: lightCssVariables,
  dark: darkCssVariables,
};

export function getThemeCssVariables(mode: ThemeMode): CssVariableMap {
  return themes[mode];
}
