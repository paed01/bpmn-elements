const safePattern = /[./\\#*:\s]/g;

export function generateId() {
  const min = 100000000;
  const max = 999999999;
  const rand = Math.floor(Math.random() * (max - min)) + min;

  return rand.toString(16);
}

export function brokerSafeId(id) {
  return id.replace(safePattern, '_');
}

export function getUniqueId(prefix) {
  return `${brokerSafeId(prefix)}_${generateId()}`;
}

export function filterUndefined(obj) {
  return Object.keys(obj).reduce((filtered, key) => {
    const objValue = obj[key];
    if (objValue !== undefined) filtered[key] = objValue;
    return filtered;
  }, {});
}

export function getOptionsAndCallback(optionsOrCallback, callback) {
  let options;
  if (typeof optionsOrCallback === 'function') {
    callback = optionsOrCallback;
  } else {
    options = optionsOrCallback;
  }

  return [options, callback];
}
