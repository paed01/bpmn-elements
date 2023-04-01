import { Broker } from 'smqp';
import { makeErrorFromMessage } from './error/Errors.js';

export {
  ActivityBroker,
  DefinitionBroker,
  MessageFlowBroker,
  ProcessBroker,
  EventBroker
};

function ActivityBroker(activity) {
  const executionBroker = ExecutionBroker(activity, 'activity');
  return executionBroker;
}

function ProcessBroker(owner) {
  const executionBroker = ExecutionBroker(owner, 'process');
  executionBroker.broker.assertQueue('api-q', {durable: false, autoDelete: false});
  executionBroker.broker.bindQueue('api-q', 'api', '#');
  return executionBroker;
}

function DefinitionBroker(owner, onBrokerReturn) {
  return ExecutionBroker(owner, 'definition', onBrokerReturn);
}

function MessageFlowBroker(owner) {
  const eventBroker = new EventBroker(owner, {prefix: 'messageflow', autoDelete: false, durable: false});
  const broker = eventBroker.broker;

  broker.assertExchange('message', 'topic', {durable: true, autoDelete: false});
  broker.assertQueue('message-q', {durable: true, autoDelete: false});
  broker.bindQueue('message-q', 'message', 'message.#');

  return eventBroker;
}

function ExecutionBroker(brokerOwner, prefix, onBrokerReturn) {
  const eventBroker = new EventBroker(brokerOwner, {prefix, autoDelete: false, durable: false}, onBrokerReturn);
  const broker = eventBroker.broker;

  broker.assertExchange('api', 'topic', {autoDelete: false, durable: false});
  broker.assertExchange('run', 'topic', {autoDelete: false});
  broker.assertExchange('format', 'topic', {autoDelete: false});
  broker.assertExchange('execution', 'topic', {autoDelete: false});

  const runQ = broker.assertQueue('run-q', {durable: true, autoDelete: false});
  const formatRunQ = broker.assertQueue('format-run-q', {durable: true, autoDelete: false});
  const executionQ = broker.assertQueue('execution-q', {durable: true, autoDelete: false});
  broker.assertQueue('inbound-q', {durable: true, autoDelete: false});

  broker.bindQueue(runQ.name, 'run', 'run.#');
  broker.bindQueue(formatRunQ.name, 'format', 'run.#');
  broker.bindQueue(executionQ.name, 'execution', 'execution.#');

  return eventBroker;
}

function EventBroker(brokerOwner, options, onBrokerReturn) {
  this.options = options;
  this.eventPrefix = options.prefix;

  const broker = this.broker = Broker(brokerOwner);
  broker.assertExchange('event', 'topic', options);
  broker.on('return', onBrokerReturn ? onBrokerReturn.bind(brokerOwner) : this._onBrokerReturnFn.bind(this));

  this.on = this.on.bind(this);
  this.once = this.once.bind(this);
  this.waitFor = this.waitFor.bind(this);
  this.emit = this.emit.bind(this);
  this.emitFatal = this.emitFatal.bind(this);
}

EventBroker.prototype.on = function on(eventName, callback, eventOptions = { once: false }) {
  const key = this._getEventRoutingKey(eventName);

  if (eventOptions.once) return this.broker.subscribeOnce('event', key, eventCallback, eventOptions);
  return this.broker.subscribeTmp('event', key, eventCallback, {...eventOptions, noAck: true});

  function eventCallback(routingKey, message, owner) {
    if (eventName === 'error') return callback(makeErrorFromMessage(message));
    callback(owner.getApi(message));
  }
};

EventBroker.prototype.once = function once(eventName, callback, eventOptions = {}) {
  return this.on(eventName, callback, {...eventOptions, once: true});
};

EventBroker.prototype.waitFor = function waitFor(eventName, onMessage) {
  const key = this._getEventRoutingKey(eventName);

  return new Promise((resolve, reject) => {
    const consumers = [
      this.broker.subscribeTmp('event', key, eventCallback, {noAck: true}),
      this.broker.subscribeTmp('event', '*.error', errorCallback, {noAck: true}),
    ];

    function eventCallback(routingKey, message, owner) {
      if (onMessage && !onMessage(routingKey, message, owner)) return;
      unsubscribe();
      return resolve(owner.getApi(message));
    }

    function errorCallback(routingKey, message, owner) {
      if (!message.properties.mandatory) return;
      unsubscribe();
      return reject(makeErrorFromMessage(message, owner));
    }

    function unsubscribe() {
      for (const consumer of consumers) {
        consumer.cancel();
      }
    }
  });
};

EventBroker.prototype.emit = function emit(eventName, content, props) {
  this.broker.publish('event', `${this.eventPrefix}.${eventName}`, {...content}, {type: eventName, ...props});
};

EventBroker.prototype.emitFatal = function emitFatal(error, content) {
  this.emit('error', {...content, error}, {mandatory: true});
};

EventBroker.prototype._onBrokerReturnFn = function onBrokerReturnFn(message) {
  if (message.properties.type === 'error') {
    const err = makeErrorFromMessage(message);
    throw err;
  }
};

EventBroker.prototype._getEventRoutingKey = function getEventRoutingKey(eventName) {
  if (eventName.indexOf('.') > -1) return eventName;

  switch (eventName) {
    case 'wait': {
      return `activity.${eventName}`;
    }
    default: {
      return `${this.eventPrefix}.${eventName}`;
    }
  }
};
