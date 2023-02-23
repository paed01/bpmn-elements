import {brokerSafeId} from '../shared.js';
import {cloneContent, shiftParent} from '../messageHelper.js';

const kMessageQ = Symbol.for('cancelQ');
const kCompleted = Symbol.for('completed');
const kExecuteMessage = Symbol.for('executeMessage');

export default function CancelEventDefinition(activity, eventDefinition) {
  const {id, broker, environment, isThrowing} = activity;
  const type = eventDefinition.type;

  this.id = id;
  this.type = type;
  const reference = this.reference = {referenceType: 'cancel'};
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
}

Object.defineProperty(CancelEventDefinition.prototype, 'executionId', {
  get() {
    const message = this[kExecuteMessage];
    return message && message.content.executionId;
  },
});

CancelEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};

CancelEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;

  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;
  const parentExecutionId = parent.executionId;

  const broker = this.broker;
  const onCatchMessage = this._onCatchMessage.bind(this);
  // this[kMessageQ].consume(onCatchMessage, {
  //   noAck: true,
  //   consumerTag: `_oncancel-${executionId}`,
  // });

  if (this[kCompleted]) return;

  this._debug('expect cancel');

  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });

  const expectRoutingKey = `execute.cancelled.${executionId}`;
  broker.subscribeOnce('execution', expectRoutingKey, this._onCatchMessage.bind(this), {
    consumerTag: `_onattached-cancel-${executionId}`,
  });

  broker.publish('execution', 'execute.expect', cloneContent(executeContent, {
    pattern: 'activity.execution.cancel',
    exchange: 'execution',
    expectRoutingKey,
  }));

  // broker.publish('execution', 'execute.detach', cloneContent(executeContent, {
  //   pattern: 'activity.execution.*',
  //   exchange: 'event',
  //   bindExchange: 'cancel',
  // }));

  const waitContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    condition: this.condition,
    expect: 'cancel',
  });
  waitContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.wait', waitContent);
};

CancelEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {executionId, parent} = executeContent;

  this.logger.debug(`<${executionId} (${this.activity.id})> throw cancel`);

  const broker = this.broker;
  const cancelContent = cloneContent(executeContent, {
    executionId: parent.executionId,
    state: 'throw',
  });
  cancelContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.cancel', cancelContent, { type: 'cancel' });

  return broker.publish('execution', 'execute.completed', cloneContent(executeContent));
};

CancelEventDefinition.prototype._onCatchMessage = function onCatchMessage(_, message) {
  const content = message.content;
  this._debug(`cancel caught from <${content.id}>`);
  return this._complete(content.message);
};

// proto._onCancelTransaction = function onCancelTransaction(_, message) {
//   const content = message.content;
//   const broker = this.broker, executionId = this.executionId;
//   const executeContent = this[kExecuteMessage].content;
//   broker.cancel(`_oncancel-${executionId}`);

//   this._debug(`cancel thrown by <${content.parent.id}.${content.id}>`);

//   // broker.assertExchange('cancel', 'topic');

//   // const detachContent = cloneContent(executeContent, {
//   //   executionId: parent.executionId,
//   //   bindExchange: 'cancel',
//   //   expect: 'cancel',
//   // });
//   // detachContent.parent = shiftParent(parent);

//   // broker.publish('execution', 'execute.detach', detachContent);

//   // broker.publish('event', 'activity.compensate', cloneContent(message.content, {
//   //   state: 'throw',
//   // }), {type: 'compensate', delegate: true});

//   broker.subscribeTmp('cancel', 'activity.leave', (__, {content: msg}) => {
//     console.log('--------------------------')

//     if (msg.id !== executeContent.attachedTo) return;
//     return this._complete(message.content.message);
//   }, {noAck: true, consumerTag: `_oncancelend-${executionId}`});
// };

CancelEventDefinition.prototype._complete = function complete(output) {
  this[kCompleted] = true;
  this._stop();
  this._debug('completed');
  const content = cloneContent(this[kExecuteMessage].content, {
    output,
    state: 'cancel',
  });
  return this.broker.publish('execution', 'execute.completed', content);
};

CancelEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'discard': {
      this[kCompleted] = true;
      this._stop();
      const content = cloneContent(this[kExecuteMessage].content);
      return this.broker.publish('execution', 'execute.discard', content);
    }
    case 'stop': {
      this._stop();
      break;
    }
  }
};

CancelEventDefinition.prototype._stop = function stop() {
  const broker = this.broker, executionId = this.executionId;
  broker.cancel(`_onattached-cancel-${executionId}`);

  broker.cancel(`_api-parent-${executionId}`);
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_oncancel-${executionId}`);
  broker.cancel(`_oncancelend-${executionId}`);
  broker.cancel(`_onattached-cancel-${executionId}`);
  // this[kMessageQ].purge();
};

CancelEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
