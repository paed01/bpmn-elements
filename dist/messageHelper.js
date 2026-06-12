"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cloneContent = cloneContent;
exports.cloneMessage = cloneMessage;
exports.cloneParent = cloneParent;
exports.pushParent = pushParent;
exports.shiftParent = shiftParent;
exports.unshiftParent = unshiftParent;
/**
 * Clone message content
 * @param {import('#types').ElementMessageContent} content
 * @param {Record<string, any>} [extend]
 * @returns cloned content
 */
function cloneContent(content, extend) {
  const {
    inbound,
    outbound,
    parent,
    sequence
  } = content;

  /** @type {import('#types').ElementMessageContent} */
  const clone = {
    ...content,
    ...extend
  };
  if (parent) {
    clone.parent = cloneParent(parent);
  }
  if (inbound) {
    clone.inbound = inbound.map(c => cloneContent(c));
  }
  if (outbound) {
    clone.outbound = outbound.map(c => cloneContent(c));
  }
  if (Array.isArray(sequence)) {
    clone.sequence = sequence.map(c => cloneContent(c));
  }
  return clone;
}

/**
 * Clone message
 * @param {import('#types').ElementBrokerMessage} message
 * @param {Record<string, any>} [overrideContent]
 * @returns {Pick<ElementBrokerMessage, 'fields' | 'content', 'properties'>}
 */
function cloneMessage(message, overrideContent) {
  return {
    fields: {
      ...message.fields
    },
    content: cloneContent(message.content, overrideContent),
    properties: {
      ...message.properties
    }
  };
}

/**
 * Clone parent
 * @param {import('#types').ElementParent} parent
 * @returns {import('#types').ElementParent} cloned parent
 */
function cloneParent(parent) {
  const {
    path
  } = parent;
  const clone = {
    ...parent
  };
  if (!path) return clone;
  clone.path = path.map(p => {
    return {
      ...p
    };
  });
  return clone;
}

/**
 * Add parent to top of path
 * @param {import('#types').ElementParent} parent
 * @param {import('#types').ElementMessageContent} adoptingParent
 * @returns {import('#types').ElementParent}
 */
function unshiftParent(parent, adoptingParent) {
  const {
    id,
    type,
    executionId
  } = adoptingParent;
  if (!parent) {
    return {
      id,
      type,
      executionId
    };
  }
  const clone = cloneParent(parent);
  const {
    id: parentId,
    type: parentType,
    executionId: parentExecutionId
  } = parent;
  clone.id = id;
  clone.executionId = executionId;
  clone.type = type;
  const path = clone.path = clone.path || [];
  path.unshift({
    id: parentId,
    type: parentType,
    executionId: parentExecutionId
  });
  return clone;
}

/**
 * Remove top parent from path
 * @param {import('#types').ElementParent} parent
 * @returns {import('#types').ElementParent}
 */
function shiftParent(parent) {
  if (!parent) return;
  if (!parent.path || !parent.path.length) return;
  const clone = cloneParent(parent);
  const {
    id,
    executionId,
    type
  } = clone.path.shift();
  clone.id = id;
  clone.executionId = executionId;
  clone.type = type;
  clone.path = clone.path.length ? clone.path : undefined;
  return clone;
}

/**
 * Add ancestor parent at end
 * @param {import('#types').ElementParent} parent
 * @param {import('#types').ElementMessageContent} ancestor
 * @returns {import('#types').ElementParent}
 */
function pushParent(parent, ancestor) {
  const {
    id,
    type,
    executionId
  } = ancestor;
  if (!parent) return {
    id,
    type,
    executionId
  };
  const clone = cloneParent(parent);
  if (clone.id === id) {
    if (executionId) clone.executionId = executionId;
    return clone;
  }
  const path = clone.path = clone.path || [];
  for (const p of path) {
    if (p.id === id) {
      if (executionId) p.executionId = executionId;
      return clone;
    }
  }
  path.push({
    id,
    type,
    executionId
  });
  return clone;
}