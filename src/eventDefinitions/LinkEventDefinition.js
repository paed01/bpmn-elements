import getPropertyValue from '../getPropertyValue.js';
import {brokerSafeId} from '../shared.js';
import {cloneContent, shiftParent} from '../messageHelper.js';

const kCompleted = Symbol.for('completed');
const kMessageQ = Symbol.for('messageQ');
const kExecuteMessage = Symbol.for('executeMessage');

export default function LinkEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing} = activity;
  const {type = 'LinkEventDefinition', behaviour} = eventDefinition;

  this.id = id;
  this.type = type;

  const reference = this.reference = {
    linkName: behaviour.name,
    referenceType: 'link',
  };

  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  this[kCompleted] = false;

  if (!isThrowing) {
    const messageQueueName = `${reference.referenceType}-${brokerSafeId(id)}-${brokerSafeId(reference.linkName)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, {autoDelete: false, durable: true});
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {durable: true});
  } else {
    broker.subscribeTmp('event', 'activity.discard', this._onDiscard.bind(this), {
      noAck: true,
      consumerTag: '_link-parent-discard',
    });
  }
}

const proto = LinkEventDefinition.prototype;

Object.defineProperty(proto, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  },
});

proto.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

proto.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;

  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;
  const parentExecutionId = parent.executionId;

  this[kMessageQ].consume(this._onCatchLink.bind(this), {
    noAck: true,
    consumerTag: `_api-link-${executionId}`,
  });

  if (this[kCompleted]) return;

  const broker = this.broker;
  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.stop.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-parent-${executionId}`,
  });
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });

  this._debug(`expect link ${this.reference.linkName}`);

  const waitContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    link: {...this.reference},
  });
  waitContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.wait', waitContent);
};

proto.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;
  const parentExecutionId = parent && parent.executionId;

  this.logger.debug(`<${executionId} (${this.activity.id})> throw link ${this.reference.linkName}`);

  const broker = this.broker;
  const linkContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    message: {...this.reference},
    state: 'throw',
  });
  linkContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.link', linkContent, {type: 'link', delegate: true});

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

proto._onCatchLink = function onCatchLink(routingKey, message) {
  if (getPropertyValue(message, 'content.message.linkName') !== this.reference.linkName) return;
  if (message.content.state === 'discard') return this._discard();
  return this._complete('caught', message.content.message);
};

proto._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'discard': {
      return this._discard();
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

proto._complete = function complete(verb, output) {
  this[kCompleted] = true;

  this._stop();

  this._debug(`${verb} link ${this.reference.linkName}`);

  const executeContent = this[kExecuteMessage].content;
  const parent = executeContent.parent;
  const catchContent = cloneContent(executeContent, {
    link: {...this.reference},
    message: {...output},
    executionId: parent.executionId,
  });
  catchContent.parent = shiftParent(parent);

  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {type: 'catch'});

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent, {output, state: 'catch'}));
};

proto._discard = function discard() {
  this[kCompleted] = true;
  this._stop();
  return this.broker.publish('execution', 'execute.discard', cloneContent(this[kExecuteMessage].content));
};

proto._stop = function stop() {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_api-link-${executionId}`);
  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  this[kMessageQ].purge();
};

proto._onDiscard = function onDiscard(_, message) {
  this.broker.publish('event', 'activity.link.discard', cloneContent(message.content, {
    message: {...this.reference},
    state: 'discard',
  }), {type: 'link', delegate: true});
};

proto._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
