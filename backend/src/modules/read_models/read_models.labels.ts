type TaxonomyEntry = {
  code: string;
  label: string;
};

const DEFAULT_CODE_LABELS: Record<string, string> = {
  booked: "Da chot hen",
  follow_up: "Dang theo doi",
  lost: "Mat co hoi",
  high: "Cao",
  medium: "Trung binh",
  low: "Thap",
  strong: "Tot",
  adequate: "Dat yeu cau",
  needs_attention: "Can cai thien",
  unknown: "Chua ro",
  revisit: "Tai kham",
  not_revisit: "Inbox moi",
  appointment_booking: "Dat lich",
  dat_lich: "Dat lich",
  hoi_gia: "Hoi gia",
  tu_van: "Tu van",
  neutral: "Trung tinh",
  positive: "Tich cuc",
  negative: "Tieu cuc"
};

export function resolveBusinessLabel(
  taxonomyJson: unknown,
  categoryKey: string,
  code: string
) {
  const normalizedCode = normalizeCode(code);
  return (
    findTaxonomyLabel(taxonomyJson, categoryKey, normalizedCode)
    ?? DEFAULT_CODE_LABELS[normalizedCode]
    ?? humanizeCode(normalizedCode)
  );
}

export function buildDisplayLabel(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "Khong ro";
}

function findTaxonomyLabel(taxonomyJson: unknown, categoryKey: string, code: string) {
  if (!taxonomyJson || typeof taxonomyJson !== "object" || Array.isArray(taxonomyJson)) {
    return null;
  }
  const categories = readRecord((taxonomyJson as Record<string, unknown>).categories);
  const category = readRecord(categories?.[categoryKey]);
  const entries = normalizeEntries(category?.entries ?? category?.values ?? category?.items);
  const match = entries.find((entry) => entry.code === code);
  return match?.label ?? null;
}

function normalizeEntries(value: unknown): TaxonomyEntry[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const entry = readRecord(item);
        if (!entry) {
          return null;
        }
        const code = normalizeCode(String(entry.code ?? entry.value ?? ""));
        const label = String(entry.label ?? entry.name ?? "").trim();
        return code && label ? { code, label } : null;
      })
      .filter((item): item is TaxonomyEntry => item !== null);
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .map(([code, item]) => {
      if (typeof item === "string") {
        return {
          code: normalizeCode(code),
          label: item.trim()
        };
      }
      const entry = readRecord(item);
      const label = String(entry?.label ?? entry?.name ?? "").trim();
      return label
        ? {
          code: normalizeCode(String(entry?.code ?? code)),
          label
        }
        : null;
    })
    .filter((item): item is TaxonomyEntry => item !== null);
}

function humanizeCode(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim();
  if (!text) {
    return "Chua ro";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
