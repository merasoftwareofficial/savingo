export const normalizeMonthStartDay = value => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(28, Math.max(1, Math.floor(parsed)));
};

export const getMonthlyRangeFromStartDay = (
  startDay,
  referenceDate = new Date(),
) => {
  const normalizedStartDay = normalizeMonthStartDay(startDay);
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    normalizedStartDay,
  );
  if (referenceDate.getDate() < normalizedStartDay) {
    start.setMonth(start.getMonth() - 1);
  }
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);

  return {startTime: start.getTime(), endTime: end.getTime()};
};

export const resolveQuickPeriodRange = (
  quickPeriod,
  monthStartDay,
  now = new Date(),
) => {
  const defaultStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const period = String(quickPeriod || '').trim().toLowerCase();

  if (period === '1month') {
    const range = getMonthlyRangeFromStartDay(monthStartDay, now);
    return {startTs: range.startTime, endTs: range.endTime};
  }

  const fixedWindows = {
    '1week': 4,
    '10days': 9,
    '15days': 14,
    '30days': 29,
  };

  if (fixedWindows[period] !== undefined) {
    const start = new Date(now);
    start.setDate(now.getDate() - fixedWindows[period]);
    start.setHours(0, 0, 0, 0);
    return {startTs: start.getTime(), endTs: null};
  }

  if (period === '3months') {
    return {startTs: now.getTime() - 90 * 24 * 60 * 60 * 1000, endTs: null};
  }
  if (period === '6months') {
    return {startTs: now.getTime() - 180 * 24 * 60 * 60 * 1000, endTs: null};
  }
  if (period === '1year') {
    return {startTs: now.getTime() - 365 * 24 * 60 * 60 * 1000, endTs: null};
  }

  return {startTs: defaultStart, endTs: null};
};
