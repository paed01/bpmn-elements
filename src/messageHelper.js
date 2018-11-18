export {
  cloneContent,
  cloneMessage,
  cloneParent,
  shiftParent,
  unshiftParent
};

function cloneContent(content) {
  const {discardSequence, inbound, parent} = content;

  const clone = {
    ...content,
  };

  if (parent) {
    clone.parent = cloneParent(parent);
  }
  if (discardSequence) {
    clone.discardSequence = discardSequence.slice();
  }
  if (inbound) {
    clone.inbound = inbound.map((c) => cloneContent(c));
  }

  return clone;
}

function cloneMessage(message) {
  return {
    fields: {...message.fields},
    content: cloneContent(message.content),
    properties: {...message.properties},
  };
}

function cloneParent(parent) {
  const {path} = parent;
  const clone = {...parent};
  if (!path) return clone;

  clone.path = path.map((p) => {
    return {...p};
  });

  return clone;
}

function unshiftParent(newParent, parent) {
  const {id, type, executionId} = newParent;
  if (!parent) {
    return {
      id,
      type,
      executionId,
    };
  }

  const clone = cloneParent(parent);
  const path = clone.path = clone.path || [];
  path.push({id, type, executionId});

  return clone;
}

function shiftParent(newParent, parent) {
  const {id, type, executionId} = newParent;
  if (!parent) return {id, type, executionId};

  const clone = cloneParent(parent);
  const path = clone.path = clone.path || [];
  path.unshift({
    id: clone.id,
    type: clone.type,
    executionId: clone.executionId,
  });

  return {
    id,
    type,
    executionId,
    path,
  };
}
