import { cloneContent, shiftParent } from '../messageHelper.js';

/**
 * Terminate event definition
 * @param {import('#types').Activity} activity
 * @param {import('moddle-context-serializer').EventDefinition} eventDefinition
 */
export function TerminateEventDefinition(activity, eventDefinition) {
  const { id, broker, environment } = activity;
  const { type = 'TerminateEventDefinition' } = eventDefinition;

  this.id = id;
  this.type = type;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
TerminateEventDefinition.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;

  const throwContent = cloneContent(executeContent, {
    state: 'terminate',
  });
  throwContent.parent = shiftParent(executeContent.parent);

  this.logger.debug(`<${executeContent.executionId} (${executeContent.id})> terminate`);
  const broker = this.broker;
  broker.publish('event', 'process.terminate', throwContent, { type: 'terminate' });
  broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};
