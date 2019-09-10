"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.cloneContent = cloneContent;
exports.cloneMessage = cloneMessage;
exports.cloneParent = cloneParent;
exports.shiftParent = shiftParent;
exports.unshiftParent = unshiftParent;
exports.pushParent = pushParent;

function cloneContent(content, extend) {
  const {
    discardSequence,
    inbound,
    outbound,
    parent,
    sequence
  } = content;
  const clone = { ...content,
    ...extend
  };

  if (parent) {
    clone.parent = cloneParent(parent);
  }

  if (discardSequence) {
    clone.discardSequence = discardSequence.slice();
  }

  if (inbound) {
    clone.inbound = inbound.map(c => cloneContent(c));
  }

  if (outbound) {
    clone.outbound = outbound.map(c => cloneContent(c));
  }

  if (sequence) {
    clone.sequence = sequence.map(c => cloneContent(c));
  }

  return clone;
}

function cloneMessage(message) {
  return {
    fields: { ...message.fields
    },
    content: cloneContent(message.content),
    properties: { ...message.properties
    }
  };
}

function cloneParent(parent) {
  const {
    path
  } = parent;
  const clone = { ...parent
  };
  if (!path) return clone;
  clone.path = path.map(p => {
    return { ...p
    };
  });
  return clone;
}

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