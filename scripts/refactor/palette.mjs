const accents = { red: "stateError", rose: "stateError", emerald: "stateSuccess", green: "stateSuccess", amber: "stateWarning", yellow: "stateWarning", blue: "statePrimary", sky: "statePrimary", cyan: "statePrimary", indigo: "statePrimary", violet: "statePrimary", purple: "statePrimary", pink: "statePrimary" };
export function paletteClass(value) {
  let count = 0;
  const text = value.replace(/\b(text|bg|border|ring|fill|stroke|from|via|to|shadow|placeholder)-(white|black|gray|slate|zinc|neutral|stone|red|rose|emerald|green|amber|yellow|blue|sky|cyan|indigo|violet|purple|pink)(?:-(\d{2,3}))?(\/\d+)?(?=[\s"'`}]|$)/g,
    (original, property, palette, shade, opacity = "") => {
      let token = accents[palette];
      if (!token) {
        if (palette === "black") token = "bgBase";
        else if (["bg", "from", "via", "to"].includes(property)) token = Number(shade) >= 800 ? "bgRaised" : "bgSurface";
        else if (["border", "ring", "shadow"].includes(property)) token = "borderDefault";
        else token = palette === "white" || Number(shade) <= 200 || Number(shade) >= 700 ? "textPrimary" : Number(shade) <= 300 ? "textSecondary" : "textMuted";
      }
      count++;
      return `${property}-[color:var(--wc-${token})]${opacity}`;
    });
  return { text, count };
}

export function colorKey(value, property, themes) {
  const candidates = Object.entries(themes.black.colors).filter(([, color]) => color.toLowerCase() === value.toLowerCase()).map(([key]) => key);
  if (candidates.length === 1) return candidates[0];
  const preferred = { color: "accentGold", borderColor: "borderHighlight", backgroundColor: "bgBase" }[property];
  return candidates.includes(preferred) ? preferred : null;
}
