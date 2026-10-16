// Timezone-aware scheduling helpers (no dependencies; Workers runtime has full Intl).

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parts(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second, wd: p.weekday.toLowerCase().slice(0, 3) };
}

function tzOffsetMs(date, tz) {
  const p = parts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - date.getTime();
}

// Wall-clock time in `tz` -> epoch ms (handles DST by double-checking the offset).
export function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMs(new Date(guess), tz);
  const t = guess - off;
  const off2 = tzOffsetMs(new Date(t), tz);
  return off2 === off ? t : guess - off2;
}

export function localDate(date, tz) {
  const p = parts(date, tz);
  return { ...p, iso: `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`, weekday: p.wd };
}

export function parseHHMM(s) { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); }

// Accepts "YYYY-MM-DD", "YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM" (tenant-local) or a full ISO with offset.
export function parseWhen(str, tz) {
  const s = String(str || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/);
  if (m) return zonedToUtc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, tz);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export function fmt(ms, tz, opts = {}) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...opts }).format(new Date(ms));
}

export function fmtTime(ms, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

export function nowDescription(tz) {
  const d = new Date();
  const long = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return `${long} (${localDate(d, tz).iso})`;
}

/**
 * Open slots on a given local date.
 * @param {object} tenant   hours/slot_minutes/timezone
 * @param {string} dateISO  YYYY-MM-DD in tenant tz
 * @param {number} durationMin
 * @param {Array<{start_at:number,end_at:number}>} bookings  epoch seconds
 * @param {number} leadMin  minimum minutes from now
 */
export function openSlots(tenant, dateISO, durationMin, bookings, leadMin = 60, max = 8) {
  const tz = tenant.timezone || "America/Denver";
  const m = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { error: "date must be YYYY-MM-DD" };
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dayStart = zonedToUtc(y, mo, d, 0, 0, tz);
  const wd = DAYS[new Date(dayStart + 12 * 3600e3).getUTCDay()];
  // weekday in tz, not UTC:
  const wdLocal = localDate(new Date(dayStart + 12 * 3600e3), tz).weekday;
  const hours = (tenant.hours || {})[wdLocal] ?? (tenant.hours || {})[wd];
  if (!hours) return { closed: true, weekday: wdLocal, slots: [] };

  const open = parseHHMM(hours[0]), close = parseHHMM(hours[1]);
  const step = Math.max(15, tenant.slot_minutes || 60);
  const earliest = Date.now() + leadMin * 60e3;
  const slots = [];
  for (let t = open; t + durationMin <= close; t += step) {
    const start = zonedToUtc(y, mo, d, Math.floor(t / 60), t % 60, tz);
    const end = start + durationMin * 60e3;
    if (start < earliest) continue;
    const clash = bookings.some((b) => b.start_at * 1000 < end && b.end_at * 1000 > start);
    if (clash) continue;
    slots.push({ start_ms: start, end_ms: end, iso: new Date(start).toISOString(), label: fmtTime(start, tz) });
    if (slots.length >= max) break;
  }
  return { closed: false, weekday: wdLocal, hours, slots };
}
