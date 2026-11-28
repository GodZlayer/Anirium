export function usePresentation() {
  return {
    locale: typeof document !== "undefined" ? document.documentElement.lang || "pt-BR" : "pt-BR",
    t: (text: string) => text,
    format: (text: string) => text,
  };
}
