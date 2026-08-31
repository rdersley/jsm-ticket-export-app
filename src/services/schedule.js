function partsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    weekday:'long', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

function timeReachedWithinWindow(parts, configuredTime, windowMinutes = 9) {
  const [h,m] = (configuredTime || '08:00').split(':').map(Number);
  const configured = h * 60 + m;
  const actual = Number(parts.hour) * 60 + Number(parts.minute);
  return actual >= configured && actual <= configured + windowMinutes;
}

export function isDue(report, now = new Date()) {
  if (!report.enabled) return false;
  const s = report.schedule || {};
  let p;
  try { p = partsInZone(now, s.timezone || 'UTC'); }
  catch { p = partsInZone(now, 'UTC'); }
  if (!timeReachedWithinWindow(p, s.time || '08:00')) return false;
  if (s.frequency === 'daily') return true;
  if (s.frequency === 'weekdays') return !['Saturday','Sunday'].includes(p.weekday);
  if (s.frequency === 'weekly') {
    const weekday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(s.weekday ?? 1)];
    return p.weekday === weekday;
  }
  if (s.frequency === 'monthly') return Number(p.day) === Number(s.monthDay || 1);
  return false;
}

export function runKey(report, now = new Date()) {
  let p;
  try { p = partsInZone(now, report.schedule?.timezone || 'UTC'); }
  catch { p = partsInZone(now, 'UTC'); }
  return `${report.id}:${p.year}-${p.month}-${p.day}T${report.schedule?.time || '08:00'}`;
}
