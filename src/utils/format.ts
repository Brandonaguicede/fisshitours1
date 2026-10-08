export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '-';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled.toFixed(scaled >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
export function formatTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** Minutes since midnight for "HH:MM[:SS]" (24h, how slots are stored) or "h:MM AM/PM"; null when it is not a time. */
export function timeToMinutes(value: string): number | null {
  const twentyFour = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (twentyFour) return Number(twentyFour[1]) * 60 + Number(twentyFour[2]);
  const twelve = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp])\.?[Mm]\.?$/.exec(value.trim());
  if (!twelve) return null;
  return ((Number(twelve[1]) % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(twelve[2]);
}

/** Departure slots in chronological order for display (a copy: the stored order is never changed). Ties and non-times keep their relative order. */
export function sortSlotsChronologically<T extends { time: string }>(slots: readonly T[]): T[] {
  return slots
    .map((slot, index) => ({ slot, index, minutes: timeToMinutes(slot.time) }))
    .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || a.index - b.index)
    .map((entry) => entry.slot);
}

/** Canonical "HH:MM" (24h, zero-padded) for any accepted spelling ("8:00", "08:00", "8:00 AM", "12:00 AM" -> "00:00"); null when it is not a time. */
export function normalizeTime(value: string): string | null {
  const minutes = timeToMinutes(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Distinct hours ("HH:MM") in chronological order. Equivalent spellings collapse into one; anything that is not a time is dropped. */
export function sortTimes(values: readonly string[]): string[] {
  const minutes = new Map<string, number>();
  for (const value of values) {
    const normalized = normalizeTime(value);
    if (normalized !== null) minutes.set(normalized, timeToMinutes(normalized) ?? 0);
  }
  return [...minutes.entries()].sort((a, b) => a[1] - b[1]).map(([time]) => time);
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
