export function addCalendarMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function calculateSubscriptionEnd(startAt, durationCode, monthMode = null) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new Error('invalid_start_date');
  if (durationCode === 'lifetime') return null;
  const monthCount = ({ month_1: 1, month_2: 2, month_4: 4, year_1: 12 })[durationCode];
  if (!monthCount) throw new Error('invalid_duration');
  if (durationCode.startsWith('month_') && !['calendar', '30_days'].includes(monthMode)) {
    throw new Error('month_mode_required');
  }
  if (durationCode.startsWith('month_') && monthMode === '30_days') {
    return new Date(start.getTime() + monthCount * 30 * 24 * 60 * 60 * 1000);
  }
  return addCalendarMonths(start, monthCount);
}
