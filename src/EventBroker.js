import { Broker } from 'smqp';
import { makeErrorFromMessage } from './error/Errors.js';

/**
 * @typedef {object} BrokerApi Shape of the bound event helpers exposed by an EventBroker
 * (and inherited by every element class that destructures from one).
 * @property {(eventName: string, callback: CallableFunction, eventOptions?: { once?: boolean, [x: string]: any }) => import('smqp').Consumer} on
 * @property {(eventName: string, callback: CallableFunction, eventOptions?: { [x: string]: any }) => import('smqp').Consumer} once
 * @property {(eventName: string, onMessage?: (routingKey: string, message: import('#types').ElementBrokerMessage, owner: any) => boolean) => Promise<any>} waitFor
 * @property {(eventName: string, content?: Record<string, any>, props?: any) => void} emit
 * @property {(error: Error, content?: Record<string, any>) => void} emitFatal
 */

/**
 * Build the broker for an activity, including run/format/execution/api exchanges and queues.
 * @param {import('#types').Activity} activity
 */
export function ActivityBroker(activity) {
  const executionBroker = ExecutionBroker(activity, 'activity');
  return executionBroker;
}

/**
 * Build the broker for a process, with an additional api-q bound to all api routing keys.
 * @param {import('#types').Process} owner
 */
export function ProcessBroker(owner) {
  const executionBroker = ExecutionBroker(owner, 'process');
  executionBroker.broker.assertQueue('api-q', { durable: false, autoDelete: false });
  executionBroker.broker.bindQueue('api-q', 'api', '#');
  return executionBroker;
}

/**
 * Build the broker for a definition. Optionally registers a custom return-message handler.
 * @param {import('#types').Definition} owner
 * @param {(message: import('#types').ElementBrokerMessage) => void} [onBrokerReturn]
 */
export function DefinitionBroker(owner, onBrokerReturn) {
  return ExecutionBroker(owner, 'definition', onBrokerReturn);
}

/**
 * Build the broker for a message flow with a durable message exchange and message-q.
 * @param {import('#types').MessageFlow} owner
 */
export function MessageFlowBroker(owner) {
  const eventBroker = new EventBroker(owner, { prefix: 'messageflow', autoDelete: false, durable: false });
  const broker = eventBroker.broker;

  broker.assertExchange('message', 'topic', { durable: true, autoDelete: false });
  broker.assertQueue('message-q', { durable: true, autoDelete: false });
  broker.bindQueue('message-q', 'message', 'message.#');

  return eventBroker;
}

function ExecutionBroker(brokerOwner, prefix, onBrokerReturn) {
  const eventBroker = new EventBroker(brokerOwner, { prefix, autoDelete: false, durable: false }, onBrokerReturn);
  const broker = eventBroker.broker;

  broker.assertExchange('api', 'topic', { autoDelete: false, durable: false });
  broker.assertExchange('run', 'topic', { autoDelete: false });
  broker.assertExchange('format', 'topic', { autoDelete: false });
  broker.assertExchange('execution', 'topic', { autoDelete: false });

  const runQ = broker.assertQueue('run-q', { durable: true, autoDelete: false });
  const formatRunQ = broker.assertQueue('format-run-q', { durable: true, autoDelete: false });
  const executionQ = broker.assertQueue('execution-q', { durable: true, autoDelete: false });
  broker.assertQueue('inbound-q', { durable: true, autoDelete: false });

  broker.bindQueue(runQ.name, 'run', 'run.#');
  broker.bindQueue(formatRunQ.name, 'format', 'run.#');
  broker.bindQueue(executionQ.name, 'execution', 'execution.#');

  return eventBroker;
}

/**
 * Owns an smqp Broker on behalf of the calling element and exposes prefixed event helpers.
 * @param {any} brokerOwner Element that owns the broker, accessed as `broker.owner`
 * @param {{ prefix: string, autoDelete?: boolean, durable?: boolean }} options
 * @param {(message: import('#types').ElementBrokerMessage) => void} [onBrokerReturn] Override for unrouted return messages
 */
export function EventBroker(brokerOwner, options, onBrokerReturn) {
  this.options = options;
  this.eventPrefix = options.prefix;

  const broker = (this.broker = new Broker(brokerOwner));
  broker.assertExchange('event', 'topic', options);
  broker.on('return', onBrokerReturn ? onBrokerReturn.bind(brokerOwner) : this._onBrokerReturnFn.bind(this));

  /** @type {BrokerApi['on']} */
  this.on = this.on.bind(this);
  /** @type {BrokerApi['once']} */
  this.once = this.once.bind(this);
  /** @type {BrokerApi['waitFor']} */
  this.waitFor = this.waitFor.bind(this);
  /** @type {BrokerApi['emit']} */
  this.emit = this.emit.bind(this);
  /** @type {BrokerApi['emitFatal']} */
  this.emitFatal = this.emitFatal.bind(this);
}

/**
 * Subscribe to a prefixed event. Errors are unwrapped via `makeErrorFromMessage`,
 * other events resolve to the owner's Api wrapper.
 * @type {BrokerApi['on']}
 */
EventBroker.prototype.on = function on(eventName, callback, eventOptions = { once: false }) {
  const key = this._getEventRoutingKey(eventName);

  if (eventOptions.once) return this.broker.subscribeOnce('event', key, eventCallback, eventOptions);
  return this.broker.subscribeTmp('event', key, eventCallback, { ...eventOptions, noAck: true });

  function eventCallback(routingKey, message, owner) {
    if (eventName === 'error') return callback(makeErrorFromMessage(message));
    callback(owner.getApi(message));
  }
};

/**
 * Subscribe to the next occurrence of an event.
 * @type {BrokerApi['once']}
 */
EventBroker.prototype.once = function once(eventName, callback, eventOptions) {
  return this.on(eventName, callback, { ...eventOptions, once: true });
};

/**
 * Promise-style wait for an event. Rejects on a mandatory `*.error` message.
 * @type {BrokerApi['waitFor']}
 */
EventBroker.prototype.waitFor = function waitFor(eventName, onMessage) {
  const key = this._getEventRoutingKey(eventName);

  return new Promise((resolve, reject) => {
    const consumers = [
      this.broker.subscribeTmp('event', key, eventCallback, { noAck: true }),
      this.broker.subscribeTmp('event', '*.error', errorCallback, { noAck: true }),
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

/**
 * Publish a prefixed event message.
 * @type {BrokerApi['emit']}
 */
EventBroker.prototype.emit = function emit(eventName, content, props) {
  this.broker.publish('event', `${this.eventPrefix}.${eventName}`, { ...content }, { type: eventName, ...props });
};

/**
 * Emit a mandatory error event. Surfaces via `on('error', ...)` or causes a return message to throw.
 * @type {BrokerApi['emitFatal']}
 */
EventBroker.prototype.emitFatal = function emitFatal(error, content) {
  this.emit('error', { ...content, error }, { mandatory: true });
};

/** @internal */
EventBroker.prototype._onBrokerReturnFn = function onBrokerReturnFn(message) {
  if (message.properties.type === 'error') {
    const err = makeErrorFromMessage(message);
    throw err;
  }
};

/** @internal */
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
