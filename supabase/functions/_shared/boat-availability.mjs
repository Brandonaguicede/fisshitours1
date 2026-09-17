export function minutesSinceMidnight(value) {
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}

export const BUFFER_MINUTES = 120;

export function intervalsOverlap(start, duration, otherStart, otherDuration, bufferMinutes = BUFFER_MINUTES) {
  const occupiedEnd = start + duration + bufferMinutes;
  const otherOccupiedEnd = otherStart + otherDuration + bufferMinutes;
  return start < otherOccupiedEnd && otherStart < occupiedEnd;
}

export function resolveAvailableDepartures({ slots, bookings, packages, timeSlots, durationMinutes, departureTimes, blockedSlotIds, operatingEnd }) {
  const durationByPackage = new Map(packages.map((item) => [item.id, item.duration_minutes]));
  const startBySlot = new Map(timeSlots.map((item) => [item.id, minutesSinceMidnight(String(item.starts_at))]));
  const operatingEndMinutes = operatingEnd == null ? null : minutesSinceMidnight(String(operatingEnd));
  return slots
    .filter((slot) => departureTimes === null || departureTimes.includes(String(slot.starts_at).slice(0, 5)))
    .map((slot) => {
      const start = minutesSinceMidnight(String(slot.starts_at));
      const candidateEnd = start === null ? null : start + durationMinutes;
      const conflicted = start !== null && bookings.some((booking) => {
        const existingStart = startBySlot.get(booking.time_slot_id);
        const existingDuration = durationByPackage.get(booking.tour_package_id);
        return existingStart !== null && existingStart !== undefined
          && Number.isInteger(existingDuration) && existingDuration > 0
          && intervalsOverlap(start, durationMinutes, existingStart, existingDuration);
      });
      const outsideOperatingHours = operatingEndMinutes !== null
        && (candidateEnd === null || candidateEnd > operatingEndMinutes);
      return { ...slot, time: String(slot.starts_at).slice(0, 5), available: !blockedSlotIds.has(slot.id) && !conflicted && !outsideOperatingHours };
    })
    .filter((slot) => slot.available);
}
