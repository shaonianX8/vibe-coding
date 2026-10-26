// 时间计算全部由普通程序完成，不交给 AI。
// 日期统一用 YYYY-MM-DD 字符串表示用户时区下的「本地日期」，避免时区换算出错。

export const DEFAULT_TZ = "Asia/Shanghai";

export interface LocalNow {
  date: string; // YYYY-MM-DD
  minutes: number; // 当天 0 点起的分钟数
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** 某个时刻在指定时区下的本地日期与分钟数 */
export function localNow(at: Date, tz: string = DEFAULT_TZ): LocalNow {
  const parts = Object.fromEntries(formatter(tz).formatToParts(at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function localDate(at: Date, tz: string = DEFAULT_TZ): string {
  return localNow(at, tz).date;
}

function toUtcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** b - a 的天数 */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/** 周一 = 1 … 周日 = 7 */
export function isoWeekday(date: string): number {
  const wd = toUtcDate(date).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** "10:00" / "10:00:00" -> 600 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const clamped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 最近 n 天（含当天），从旧到新 */
export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

export function formatCnDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const wd = ["", "一", "二", "三", "四", "五", "六", "日"][isoWeekday(date)];
  return `${m}月${d}日 周${wd}`;
}

// ---------------------------------------------------------------
// 复盘周期：永远指「上一个完整周期」，闭区间 [start, end]
// ---------------------------------------------------------------
export interface Period {
  start: string;
  end: string;
  label: string;
}

/** 上一个完整自然周（周一到周日） */
export function previousWeek(today: string): Period {
  const thisMonday = addDays(today, 1 - isoWeekday(today));
  const start = addDays(thisMonday, -7);
  const end = addDays(thisMonday, -1);
  return { start, end, label: `${start} 至 ${end}` };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 上一个完整自然月 */
export function previousMonth(today: string): Period {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return { start: ymd(py, pm, 1), end: ymd(py, pm, lastDayOfMonth(py, pm)), label: `${py}年${pm}月` };
}

/** 上一个完整季度 */
export function previousQuarter(today: string): Period {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const pq = q === 1 ? 4 : q - 1;
  const py = q === 1 ? y - 1 : y;
  const startM = (pq - 1) * 3 + 1;
  const endM = startM + 2;
  return { start: ymd(py, startM, 1), end: ymd(py, endM, lastDayOfMonth(py, endM)), label: `${py}年第${pq}季度` };
}

/** 上一个完整半年 */
export function previousHalfYear(today: string): Period {
  const [y, m] = today.split("-").map(Number);
  if (m <= 6) return { start: ymd(y - 1, 7, 1), end: ymd(y - 1, 12, 31), label: `${y - 1}年下半年` };
  return { start: ymd(y, 1, 1), end: ymd(y, 6, 30), label: `${y}年上半年` };
}

/** 上一个完整自然年 */
export function previousYear(today: string): Period {
  const y = Number(today.slice(0, 4)) - 1;
  return { start: ymd(y, 1, 1), end: ymd(y, 12, 31), label: `${y}年` };
}

/** 今天到期的复盘（多个同日到期时合并为一个入口） */
export function reviewsDueOn(today: string): Array<"week" | "month" | "quarter" | "half" | "year"> {
  const [, m, d] = today.split("-").map(Number);
  const due: Array<"week" | "month" | "quarter" | "half" | "year"> = [];
  if (isoWeekday(today) === 1) due.push("week");
  if (d === 1) {
    due.push("month");
    if ((m - 1) % 3 === 0) due.push("quarter");
    if (m === 1 || m === 7) due.push("half");
    if (m === 1) due.push("year");
  }
  return due;
}
