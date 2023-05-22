// License MIT @ https://tolu.mit-license.org/

const numbers = '\\d+';
const fractionalNumbers = ''.concat(numbers, '(?:[\\.,]').concat(numbers, ')?');
const datePattern = '('.concat(numbers, 'Y)?(').concat(numbers, 'M)?(').concat(numbers, 'W)?(').concat(fractionalNumbers, 'D)?');
const timePattern = 'T('.concat(fractionalNumbers, 'H)?(').concat(fractionalNumbers, 'M)?(').concat(fractionalNumbers, 'S)?');

const rPattern = '(?:R('.concat(numbers).concat(')/)?');
const iso8601 = rPattern.concat('P(?:').concat(datePattern, '(?:').concat(timePattern, ')?)');
const objMap = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
];
const defaultDuration = Object.freeze({
  years: 0,
  months: 0,
  weeks: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
});

/**
 * The ISO8601 regex for matching / testing durations
 */
const pattern = new RegExp(iso8601);

/** Parse PnYnMnDTnHnMnS format to object */
export function parse(durationString) {
  const matches = durationString.replace(/,/g, '.').match(pattern);
  if (!matches) {
    throw new RangeError('invalid duration: ' + durationString);
  }

  // Slice away repeat and first entry in match-array (the input string)
  const slicedMatches = matches.slice(2);
  if (slicedMatches.filter(Boolean).length === 0) {
    throw new RangeError('invalid duration: ' + durationString);
  }
  // Check only one fraction is used
  if (slicedMatches.filter((v) => {
    return /\./.test(v || '');
  }).length > 1) {
    throw new RangeError('Fractions are allowed on the smallest unit in the string, e.g. P0.5D or PT1.0001S but not PT0.5M0.1S: ' + durationString);
  }

  const result = {};
  if (matches[1]) result.repeat = Number(matches[1]);

  return slicedMatches.reduce((prev, next, idx) => {
    prev[objMap[idx]] = parseFloat(next || '0') || 0;
    return prev;
  }, result);
}

/** Convert ISO8601 duration object to an end Date. */

export function end(durationInput, startDate) {
  const duration = Object.assign({}, defaultDuration, durationInput);
  // Create two equal timestamps, add duration to 'then' and return time difference
  const timestamp = startDate.getTime();
  const then = new Date(timestamp);
  then.setFullYear(then.getFullYear() + duration.years);
  then.setMonth(then.getMonth() + duration.months);
  then.setDate(then.getDate() + duration.days);
  // set time as milliseconds to get fractions working for minutes/hours
  const hoursInMs = duration.hours * 3600 * 1000;
  const minutesInMs = duration.minutes * 60 * 1000;
  then.setMilliseconds(then.getMilliseconds() + duration.seconds * 1000 + hoursInMs + minutesInMs);
  // Special case weeks
  then.setDate(then.getDate() + duration.weeks * 7);
  return then;
}

/** Convert ISO8601 duration object to seconds */
export function toSeconds(durationInput, startDate) {
  if (startDate === void 0) {
    startDate = new Date();
  }
  const duration = Object.assign({}, defaultDuration, durationInput);
  const timestamp = startDate.getTime();
  const now = new Date(timestamp);
  const then = end(duration, now);
  const seconds = (then.getTime() - now.getTime()) / 1000;
  return seconds;
}
