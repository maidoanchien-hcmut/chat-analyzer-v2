export function escapeHtml(value: string | number | boolean | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function joinHtml(parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join("");
}

export function selected(value: string, current: string) {
  return value === current ? "selected" : "";
}

export function checked(value: boolean) {
  return value ? "checked" : "";
}
