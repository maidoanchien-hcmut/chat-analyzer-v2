export type TimezoneOption = {
  value: string;
  label: string;
};

const FALLBACK_TIMEZONE_OPTIONS = [
  "Africa/Abidjan",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Saigon",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "UTC"
];

const LEGACY_TIMEZONE_LABELS: Record<string, string> = {
  "Asia/Saigon": "Asia/Saigon (legacy alias)"
};

export function buildTimezoneOptions(values: Array<string | null | undefined>) {
  const options: TimezoneOption[] = [];
  const seen = new Set<string>();

  const append = (value: string) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    options.push({
      value: normalized,
      label: LEGACY_TIMEZONE_LABELS[normalized] ?? normalized
    });
  };

  for (const value of resolveSupportedTimezones()) {
    append(value);
  }

  for (const value of values) {
    if (typeof value === "string") {
      append(value);
    }
  }

  return options;
}

function resolveSupportedTimezones() {
  const supportedValuesOf = Reflect.get(Intl, "supportedValuesOf");
  if (typeof supportedValuesOf === "function") {
    try {
      const values = supportedValuesOf.call(Intl, "timeZone");
      if (Array.isArray(values) && values.every((value) => typeof value === "string")) {
        return [...values].sort((left, right) => left.localeCompare(right));
      }
    } catch {
      return [...FALLBACK_TIMEZONE_OPTIONS];
    }
  }
  return [...FALLBACK_TIMEZONE_OPTIONS];
}
