// EIA release calendar for the research terminal.
//
// Sources, retrieved 8 November 2026:
//   Weekly Petroleum Status Report
//     https://www.eia.gov/petroleum/supply/weekly/schedule.php
//     Standard: Wednesday, 10:30 a.m. Eastern, except the rows below.
//   Weekly Natural Gas Storage Report
//     https://ir.eia.gov/ngs/schedule.html
//     Standard: Thursday, 10:30 a.m. Eastern, except the rows below.
//
// Petroleum rows are keyed by the "week ending" Friday on the EIA table.
// Gas rows are keyed by the standard Thursday that the published alternate replaces
// (the Thursday of the holiday named on that row).
//
// A later holiday that EIA has not published yet is "not available".
// This file does not guess a shifted clock time.

var EIARelease = (function () {
  var NOT_AVAILABLE = "not available";

  // week-ending Friday -> [year, month, day, hour, minute] Eastern
  var PETROLEUM = {
    "2024-12-27": [2025, 1, 2, 11, 0],
    "2025-01-17": [2025, 1, 23, 12, 0],
    "2025-02-14": [2025, 2, 20, 12, 0],
    "2025-05-23": [2025, 5, 29, 12, 0],
    "2025-08-29": [2025, 9, 4, 12, 0],
    "2025-10-10": [2025, 10, 16, 12, 0],
    "2025-11-07": [2025, 11, 13, 12, 0],
    "2025-12-19": [2025, 12, 29, 17, 0],
    "2026-01-16": [2026, 1, 22, 12, 0],
    "2026-02-13": [2026, 2, 19, 12, 0],
    "2026-05-22": [2026, 5, 28, 12, 0],
    "2026-09-04": [2026, 9, 10, 12, 0],
    "2026-10-09": [2026, 10, 15, 12, 0],
    "2026-11-06": [2026, 11, 12, 12, 0]
  };

  // standard Thursday -> published alternate [year, month, day, hour, minute] Eastern
  var GAS = {
    "2025-01-02": [2025, 1, 3, 10, 30],   // New Year's Day
    "2025-01-09": [2025, 1, 8, 12, 0],    // National Day of Mourning
    "2025-06-19": [2025, 6, 18, 12, 0],   // Juneteenth
    "2025-11-13": [2025, 11, 14, 10, 30], // Veterans Day
    "2025-11-27": [2025, 11, 26, 12, 0],  // Thanksgiving Day
    "2025-12-25": [2025, 12, 29, 12, 0],  // Christmas Day
    "2026-01-01": [2025, 12, 31, 12, 0],  // New Year's Day
    "2026-11-12": [2026, 11, 13, 10, 30], // Veterans Day
    "2026-11-26": [2026, 11, 25, 12, 0]   // Thanksgiving Day
  };

  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var holidayCache = {};

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }

  function addDays(y, m, d, n) {
    var t = new Date(Date.UTC(y, m - 1, d + n));
    return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  }

  function weekday(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function stamp(y, m, d, h, min) {
    return y * 100000000 + m * 1000000 + d * 10000 + h * 100 + min;
  }

  function nthWeekday(year, month, wd, n) {
    var firstWd = weekday(year, month, 1);
    var day = 1 + (wd - firstWd + 7) % 7 + (n - 1) * 7;
    return [year, month, day];
  }

  function lastWeekday(year, month, wd) {
    var last = new Date(Date.UTC(year, month, 0));
    var day = last.getUTCDate() - (last.getUTCDay() - wd + 7) % 7;
    return [year, month, day];
  }

  function observed(y, m, d) {
    var wd = weekday(y, m, d);
    if (wd === 6) return addDays(y, m, d, -1);
    if (wd === 0) return addDays(y, m, d, 1);
    return [y, m, d];
  }

  function buildHolidaySet(year) {
    var set = {};
    function keep(parts) {
      if (parts[0] === year) set[iso(parts[0], parts[1], parts[2])] = true;
    }
    keep(observed(year, 1, 1));
    keep(observed(year + 1, 1, 1));
    keep(nthWeekday(year, 1, 1, 3));
    keep(nthWeekday(year, 2, 1, 3));
    keep(lastWeekday(year, 5, 1));
    keep(observed(year, 6, 19));
    keep(observed(year, 7, 4));
    keep(nthWeekday(year, 9, 1, 1));
    keep(nthWeekday(year, 10, 1, 2));
    keep(observed(year, 11, 11));
    keep(nthWeekday(year, 11, 4, 4));
    keep(observed(year, 12, 25));
    return set;
  }

  function isFederalHoliday(y, m, d) {
    if (!holidayCache[y]) holidayCache[y] = buildHolidaySet(y);
    return !!holidayCache[y][iso(y, m, d)];
  }

  function formatTime(h, min) {
    var mer = h >= 12 ? "p.m." : "a.m.";
    var hr = h % 12;
    if (hr === 0) hr = 12;
    return hr + ":" + pad(min) + " " + mer;
  }

  function formatRelease(parts) {
    return WD[weekday(parts[0], parts[1], parts[2])] + " " +
      MO[parts[1] - 1] + " " + parts[2] + " " +
      formatTime(parts[3], parts[4]) + " ET";
  }

  function etParts(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hourCycle: "h23"
    });
    var p = {};
    fmt.formatToParts(date).forEach(function (part) { p[part.type] = part.value; });
    return {
      y: +p.year, m: +p.month, d: +p.day,
      hour: (+p.hour) % 24, minute: +p.minute
    };
  }

  function nowStamp(date) {
    var p = etParts(date);
    return stamp(p.y, p.m, p.d, p.hour, p.minute);
  }

  function onOrBeforeWeekday(y, m, d, wd) {
    var back = (weekday(y, m, d) - wd + 7) % 7;
    return addDays(y, m, d, -back);
  }

  function petroleumUnpublished(friday) {
    var mon = addDays(friday[0], friday[1], friday[2], 3);
    var tue = addDays(friday[0], friday[1], friday[2], 4);
    var wed = addDays(friday[0], friday[1], friday[2], 5);
    var thu = addDays(friday[0], friday[1], friday[2], 6);
    if (isFederalHoliday(mon[0], mon[1], mon[2]) ||
        isFederalHoliday(tue[0], tue[1], tue[2]) ||
        isFederalHoliday(wed[0], wed[1], wed[2])) return true;
    // Christmas Day on Thursday: in 2025 EIA moved the Christmas Eve release
    // off the normal Wednesday. Do not invent that time when it is not published.
    return thu[1] === 12 && thu[2] === 25;
  }

  function gasUnpublished(friday) {
    var tue = addDays(friday[0], friday[1], friday[2], 4);
    var wed = addDays(friday[0], friday[1], friday[2], 5);
    var thu = addDays(friday[0], friday[1], friday[2], 6);
    return isFederalHoliday(tue[0], tue[1], tue[2]) ||
      isFederalHoliday(wed[0], wed[1], wed[2]) ||
      isFederalHoliday(thu[0], thu[1], thu[2]);
  }

  function known(parts) {
    return {
      unavailable: false,
      text: formatRelease(parts),
      stamp: stamp(parts[0], parts[1], parts[2], parts[3], parts[4])
    };
  }

  function unknown(normal) {
    return { unavailable: true, normal: normal, text: NOT_AVAILABLE };
  }

  function petroleumForWeek(friday) {
    var key = iso(friday[0], friday[1], friday[2]);
    if (PETROLEUM[key]) return known(PETROLEUM[key]);
    var wed = addDays(friday[0], friday[1], friday[2], 5);
    var normal = [wed[0], wed[1], wed[2], 10, 30];
    if (petroleumUnpublished(friday)) return unknown(normal);
    return known(normal);
  }

  function gasForWeek(friday) {
    var thu = addDays(friday[0], friday[1], friday[2], 6);
    var key = iso(thu[0], thu[1], thu[2]);
    if (GAS[key]) return known(GAS[key]);
    var normal = [thu[0], thu[1], thu[2], 10, 30];
    if (gasUnpublished(friday)) return unknown(normal);
    return known(normal);
  }

  // An unpublished holiday release stays "not available" until a week after the
  // normal slot, so a delay is not replaced by the following week's date.
  function stillPending(rel, nowS) {
    var end = addDays(rel.normal[0], rel.normal[1], rel.normal[2], 6);
    return nowS <= stamp(end[0], end[1], end[2], 23, 59);
  }

  function nextFrom(forWeek, date) {
    var et = etParts(date);
    var nowS = nowStamp(date);
    var friday = onOrBeforeWeekday(et.y, et.m, et.d, 5);
    friday = addDays(friday[0], friday[1], friday[2], -7);
    for (var i = 0; i < 20; i++) {
      var rel = forWeek(friday);
      if (rel.unavailable) {
        if (stillPending(rel, nowS)) return NOT_AVAILABLE;
      } else if (rel.stamp > nowS) {
        return rel.text;
      }
      friday = addDays(friday[0], friday[1], friday[2], 7);
    }
    return NOT_AVAILABLE;
  }

  function nextPetroleum(date) { return nextFrom(petroleumForWeek, date || new Date()); }
  function nextGas(date) { return nextFrom(gasForWeek, date || new Date()); }

  return {
    NOT_AVAILABLE: NOT_AVAILABLE,
    PETROLEUM: PETROLEUM,
    GAS: GAS,
    isFederalHoliday: isFederalHoliday,
    weekday: weekday,
    nextPetroleum: nextPetroleum,
    nextGas: nextGas
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = EIARelease;
