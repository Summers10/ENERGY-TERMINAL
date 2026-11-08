#!/usr/bin/env node
"use strict";

const cal = require("./release-calendar.js");
let failed = 0;

function eq(actual, expected, label) {
  if (actual !== expected) {
    failed += 1;
    console.error("FAIL", label);
    console.error("  expected:", expected);
    console.error("  actual:  ", actual);
  }
}

function assert(cond, label) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", label);
  }
}

// Resolve an Eastern wall-clock time to a Date.
function etDate(y, m, d, h, min) {
  let t = Date.UTC(y, m - 1, d, h + 5, min);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  for (let i = 0; i < 6; i++) {
    const p = {};
    fmt.formatToParts(new Date(t)).forEach(part => { p[part.type] = part.value; });
    const got = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute);
    const want = Date.UTC(y, m - 1, d, h, min);
    if (got === want) return new Date(t);
    t += want - got;
  }
  throw new Error("could not resolve Eastern time");
}

// Federal holidays used by the unpublished-shift guard.
eq(cal.isFederalHoliday(2026, 1, 1), true, "New Year 2026");
eq(cal.isFederalHoliday(2026, 1, 19), true, "MLK 2026");
eq(cal.isFederalHoliday(2026, 2, 16), true, "Presidents Day 2026");
eq(cal.isFederalHoliday(2026, 5, 25), true, "Memorial Day 2026");
eq(cal.isFederalHoliday(2026, 6, 19), true, "Juneteenth 2026");
eq(cal.isFederalHoliday(2026, 7, 3), true, "Independence Day observed 2026");
eq(cal.isFederalHoliday(2026, 7, 4), false, "Independence Day Saturday is not the observed closure");
eq(cal.isFederalHoliday(2026, 9, 7), true, "Labor Day 2026");
eq(cal.isFederalHoliday(2026, 10, 12), true, "Columbus Day 2026");
eq(cal.isFederalHoliday(2026, 11, 11), true, "Veterans Day 2026");
eq(cal.isFederalHoliday(2026, 11, 26), true, "Thanksgiving 2026");
eq(cal.isFederalHoliday(2026, 12, 25), true, "Christmas 2026");
eq(cal.isFederalHoliday(2027, 1, 18), true, "MLK 2027");
eq(cal.isFederalHoliday(2025, 12, 31), false, "31 Dec 2025 is not a federal holiday");

Object.keys(cal.PETROLEUM).forEach(key => {
  const [y, m, d] = key.split("-").map(Number);
  assert(cal.weekday(y, m, d) === 5, "petroleum week-ending is Friday " + key);
});
Object.keys(cal.GAS).forEach(key => {
  const [y, m, d] = key.split("-").map(Number);
  assert(cal.weekday(y, m, d) === 4, "gas key is the standard Thursday " + key);
});

// Veterans Day 2026 is Wednesday 11 November. The old calendar said
// petroleum Wednesday 10:30 and gas Thursday 10:30. EIA published otherwise.
const veteransWeek = etDate(2026, 11, 8, 12, 0);
eq(cal.nextPetroleum(veteransWeek), "Thu Nov 12 12:00 p.m. ET", "petroleum Veterans Day 2026");
eq(cal.nextGas(veteransWeek), "Fri Nov 13 10:30 a.m. ET", "gas Veterans Day 2026");

eq(cal.nextPetroleum(etDate(2026, 11, 11, 9, 0)), "Thu Nov 12 12:00 p.m. ET", "still Thursday noon on Veterans Day morning");
eq(cal.nextGas(etDate(2026, 11, 12, 10, 30)), "Fri Nov 13 10:30 a.m. ET", "gas is not the Thursday slot");

// At the published minute the release is no longer "next".
eq(cal.nextPetroleum(etDate(2026, 11, 12, 12, 0)), "Wed Nov 18 10:30 a.m. ET", "petroleum after the noon release");
eq(cal.nextGas(etDate(2026, 11, 13, 10, 30)), "Thu Nov 19 10:30 a.m. ET", "gas after the Friday release");

eq(cal.nextPetroleum(etDate(2026, 11, 16, 9, 0)), "Wed Nov 18 10:30 a.m. ET", "ordinary petroleum Wednesday");
eq(cal.nextGas(etDate(2026, 11, 16, 9, 0)), "Thu Nov 19 10:30 a.m. ET", "ordinary gas Thursday");

// Thanksgiving 2026: gas moves to Wednesday noon; petroleum stays Wednesday 10:30.
eq(cal.nextPetroleum(etDate(2026, 11, 23, 9, 0)), "Wed Nov 25 10:30 a.m. ET", "petroleum day before Thanksgiving");
eq(cal.nextGas(etDate(2026, 11, 23, 9, 0)), "Wed Nov 25 12:00 p.m. ET", "gas Thanksgiving 2026");
eq(cal.nextPetroleum(etDate(2026, 11, 25, 11, 0)), "Wed Dec 2 10:30 a.m. ET", "petroleum after 10:30 on 25 Nov");
eq(cal.nextGas(etDate(2026, 11, 25, 11, 0)), "Wed Nov 25 12:00 p.m. ET", "gas still noon on Thanksgiving eve");
eq(cal.nextGas(etDate(2026, 11, 25, 12, 0)), "Thu Dec 3 10:30 a.m. ET", "gas after Thanksgiving release");

// Published rows that do not follow a one-day shift.
eq(cal.nextPetroleum(etDate(2025, 12, 23, 9, 0)), "Mon Dec 29 5:00 p.m. ET", "petroleum Christmas 2025");
eq(cal.nextGas(etDate(2025, 12, 26, 9, 0)), "Mon Dec 29 12:00 p.m. ET", "gas Christmas 2025");
eq(cal.nextGas(etDate(2025, 12, 30, 9, 0)), "Wed Dec 31 12:00 p.m. ET", "gas New Year 2026");
// Christmas Day 2024 was a Wednesday and is not a row on the current EIA table.
// The day before the published New Year release still has to say so.
eq(cal.nextPetroleum(etDate(2024, 12, 31, 9, 0)), "not available", "unpublished Christmas 2024 petroleum week");
eq(cal.nextPetroleum(etDate(2025, 1, 1, 9, 0)), "Thu Jan 2 11:00 a.m. ET", "petroleum New Year 2025 is 11:00");
eq(cal.nextPetroleum(etDate(2026, 5, 25, 9, 0)), "Thu May 28 12:00 p.m. ET", "petroleum Memorial Day 2026");
eq(cal.nextPetroleum(etDate(2025, 9, 1, 9, 0)), "Thu Sep 4 12:00 p.m. ET", "petroleum Labor Day 2025");
eq(cal.nextGas(etDate(2025, 9, 1, 9, 0)), "Thu Sep 4 10:30 a.m. ET", "gas stays Thursday on a Monday holiday");

// Monday holiday not yet on the petroleum schedule: do not invent Thursday noon.
eq(cal.nextPetroleum(etDate(2027, 1, 15, 9, 0)), "not available", "unpublished MLK 2027 petroleum");
eq(cal.nextGas(etDate(2027, 1, 15, 9, 0)), "Thu Jan 21 10:30 a.m. ET", "gas MLK 2027 stays Thursday");

// Friday holiday with no published exception stays on the standard day.
eq(cal.nextPetroleum(etDate(2026, 6, 29, 9, 0)), "Wed Jul 1 10:30 a.m. ET", "petroleum before observed Independence Day");
eq(cal.nextGas(etDate(2026, 6, 29, 9, 0)), "Thu Jul 2 10:30 a.m. ET", "gas before observed Independence Day");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("release calendar ok");
