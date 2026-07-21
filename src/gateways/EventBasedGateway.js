import { Activity } from '../activity/Activity.js';
import { cloneContent } from '../messageHelper.js';
import { K_COMPLETED, K_TARGETS } from '../constants.js';

/**
 * Event based gateway
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function EventBasedGateway(activityDef, context) {
  return new Activity(EventBasedGatewayBehaviour, activityDef, context);
}

/**
 * Event based gateway behaviour
 * @param {import('#types').Activity} activity
 * @param {import('#types').ContextInstance} context
 */
export function EventBasedGatewayBehaviour(activity, context) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this.context = context;
  /** @internal */
  this[K_TARGETS] = new Set(activity.outbound.map((flow) => context.getActivityById(flow.targetId)));
  /** @internal */
  this[K_COMPLETED] = false;
}

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
EventBasedGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const { executionId, outbound = [], outboundTaken } = executeContent;

  const targets = this[K_TARGETS];
  this[K_COMPLETED] = false;
  if (!targets.size) return this._complete(executeContent);

  for (const flow of this.activity.outbound) {
    outbound.push({ id: flow.id, action: 'take' });
  }

  if (!this[K_COMPLETED] && outboundTaken) return;

  const targetConsumerTag = `_gateway-listener-${this.id}`;

  const onTargetCompleted = this._onTargetCompleted.bind(this, executeMessage);
  for (const target of this[K_TARGETS]) {
    target.broker.subscribeOnce('event', 'activity.end', onTargetCompleted, { consumerTag: targetConsumerTag });
  }

  const broker = this.activity.broker;
  broker.subscribeOnce('api', `activity.stop.${executionId}`, () => this._stop(), {
    consumerTag: '_api-stop-execution',
  });

  this[K_COMPLETED] = false;

  if (!executeMessage.fields.redelivered) {
    return broker.publish('execution', 'execute.outbound.take', cloneContent(executeContent, { outboundTaken: true }));
  }
};

EventBasedGatewayBehaviour.prototype._onTargetCompleted = function onTargetCompleted(executeMessage, _, message, owner) {
  const { id: targetId, executionId: targetExecutionId } = message.content;
  const executeContent = executeMessage.content;
  const executionId = executeContent.executionId;
  this.activity.logger.debug(`<${executionId} (${this.id})> <${targetExecutionId}> completed run, discarding the rest`);

  this._stop();
  for (const target of this[K_TARGETS]) {
    if (target === owner) continue;
    target.discard();
  }

  const completedContent = cloneContent(executeContent, {
    taken: {
      id: targetId,
      executionId: targetExecutionId,
    },
    ignoreOutbound: true,
  });

  this._complete(completedContent);
};

EventBasedGatewayBehaviour.prototype._complete = function complete(completedContent) {
  this[K_COMPLETED] = true;
  this.broker.publish('execution', 'execute.completed', cloneContent(completedContent));
};

EventBasedGatewayBehaviour.prototype._stop = function stop() {
  const targetConsumerTag = `_gateway-listener-${this.id}`;
  for (const target of this[K_TARGETS]) target.broker.cancel(targetConsumerTag);
  this.broker.cancel('_api-stop-execution');
};
