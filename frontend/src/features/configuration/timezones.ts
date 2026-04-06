export type TimezoneOption = {
  value: string;
  label: string;
};

const CANONICAL_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Asia/Ho_Chi_Minh", label: "GMT+07:00 - Asia/Ho_Chi_Minh" },
  { value: "UTC", label: "GMT+00:00 - UTC" },
  { value: "Asia/Bangkok", label: "GMT+07:00 - Asia/Bangkok" },
  { value: "Asia/Singapore", label: "GMT+08:00 - Asia/Singapore" },
  { value: "Asia/Tokyo", label: "GMT+09:00 - Asia/Tokyo" },
  { value: "Australia/Sydney", label: "GMT+10:00 - Australia/Sydney" },
  { value: "Europe/London", label: "GMT+00:00 - Europe/London" },
  { value: "Europe/Paris", label: "GMT+01:00 - Europe/Paris" },
  { value: "America/New_York", label: "GMT-05:00 - America/New_York" },
  { value: "America/Chicago", label: "GMT-06:00 - America/Chicago" },
  { value: "America/Denver", label: "GMT-07:00 - America/Denver" },
  { value: "America/Los_Angeles", label: "GMT-08:00 - America/Los_Angeles" }
];

const LEGACY_TIMEZONE_LABELS: Record<string, string> = {
  "Asia/Saigon": "GMT+07:00 - Asia/Saigon (legacy alias)"
};

export function buildTimezoneOptions(values: Array<string | null | undefined>) {
  const options: TimezoneOption[] = [];
  const seen = new Set<string>();

  const append = (option: TimezoneOption) => {
    const value = option.value.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    options.push({
      value,
      label: option.label.trim() || value
    });
  };

  for (const option of CANONICAL_TIMEZONE_OPTIONS) {
    append(option);
  }

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    append({
      value: normalized,
      label: LEGACY_TIMEZONE_LABELS[normalized] ?? `Giá trị đang lưu - ${normalized}`
    });
  }

  return options;
}
