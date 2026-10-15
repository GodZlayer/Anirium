import black from "./builtinBlackTheme.json";

export const blackTheme = black;
export const themeCssVariables: Record<string,string> = {
  "background.base":"--color-bg-base", "surface.base":"--color-surface-graphite",
  "surface.raised":"--color-surface-charcoal", "border.default":"--color-border-warm",
  "text.primary":"--color-text-ivory", "text.secondary":"--color-text-beige",
  "action.primary":"--color-gold", "action.active":"--color-amber",
  "state.primary":"--color-primary", "state.error":"--color-secondary", "state.success":"--color-accent",
  "state.warning":"--color-highlight", "state.disabled":"--color-disabled",
};

/** Only the packaged, verified black release is available today. */
export function resolveThemeTokens(_selection?: string) {
  return {...black.tokens};
}

export function themeCssProperties(selection?: string): Record<string,string> {
  const tokens: Record<string,string> = resolveThemeTokens(selection);
  return {...Object.fromEntries(Object.entries(themeCssVariables).map(([key,property])=>[property,tokens[key]])),
    "--color-neutral-dark":tokens["background.base"],"--color-neutral-light":tokens["text.primary"]};
}
