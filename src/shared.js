const safePattern = /[./\\#*:\s]/g;

export function generateId() {
  return Math.random().toString(16).substring(2, 12);
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
