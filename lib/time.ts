// Asia/Manila time rules for Hi, Stranger

export function manilaNowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((a, p) => {
    if (p.type !== "literal") a[p.type] = p.value;
    return a;
  }, {});

  const h = Number(parts.hour);
  const m = Number(parts.minute);
  const s = Number(parts.second);
  return { h, m, s };
}

// Open window: 9:00–10:00 PM
export function isWithinOpenHour() {
  const { h } = manilaNowParts();
  return h === 21;
}

// Entry allowed only before 9:45 PM
export function canEnterNow() {
  const { h, m } = manilaNowParts();
  return h === 21 && m < 45;
}

// Matching allowed only before 9:50 PM
export function canMatchNow() {
  const { h, m } = manilaNowParts();
  return h === 21 && m < 50;
}

// Hard close at 10:00 PM
export function isHardClosed() {
  const { h } = manilaNowParts();
  return h !== 21;
}

