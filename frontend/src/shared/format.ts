export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("vi-VN");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN");
}

export function formatNumber(value: number) {
  return value.toLocaleString("vi-VN");
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatDurationMinutes(value: number) {
  return `${value.toFixed(0)} phút`;
}

export function formatCurrencyMicros(value: number) {
  return `${Math.round(value / 1_000_000).toLocaleString("vi-VN")} đ`;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}
