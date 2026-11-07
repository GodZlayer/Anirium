export function catalogPreviewSelected(search = typeof window === "undefined" ? "" : window.location.search) {
  return new URLSearchParams(search).get("catalog") === "candidate";
}

export function catalogLandingUrl(search) {
  const current = new URLSearchParams(search);
  if (!catalogPreviewSelected(search)) return "/";
  const selected = new URLSearchParams({ catalog: "candidate" });
  if (current.has("candidate")) selected.set("candidate", current.get("candidate"));
  return `/?${selected}`;
}
