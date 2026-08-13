import { cloneContent, shiftParent } from '../messageHelper.js';
import { K_EXECUTE_MESSAGE } from '../constants.js';

/**
 * Link event definition
 * @param {import('#types').Activity} activity
 * @param {import('#types').SerializableElement} eventDefinition
 */
export function LinkEventDefinition(activity, eventDefinition) {
  const { id, broker, environment, isThrowing } = activity;
  const { type = 'LinkEventDefinition', behaviour } = eventDefinition;

  this.id = id;
  this.type = type;

  /** @type {import('#types').EventReference} */
  this.reference = {
    id: behaviour.name,
    linkName: behaviour.name,
    referenceType: 'link',
  };

  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
}

Object.defineProperty(LinkEventDefinition.prototype, 'executionId', {
  /** @returns {string} */
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
LinkEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
LinkEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[K_EXECUTE_MESSAGE] = executeMessage;

  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;
  const parentExecutionId = parent.executionId;

  const linkMessage = executeContent.message ?? executeContent.input ?? { ...this.reference };

  this.logger.debug(`<${executionId} (${this.activity.id})> caught link ${this.reference.linkName}`);

  const broker = this.broker;
  const catchContent = cloneContent(executeContent, {
    link: { ...this.reference },
    message: { ...linkMessage },
    executionId: parentExecutionId,
  });
  catchContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.catch', catchContent, { type: 'catch' });

  broker.publish('execution', 'execute.completed', cloneContent(executeContent, { output: linkMessage, state: 'catch' }));
};

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
LinkEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;
  const parentExecutionId = parent && parent.executionId;

  this.logger.debug(`<${executionId} (${this.activity.id})> throw link ${this.reference.linkName}`);

  const broker = this.broker;
  const linkContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    message: { ...this.reference },
    state: 'throw',
  });
  linkContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.link', linkContent, { type: 'link' });

  broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};
