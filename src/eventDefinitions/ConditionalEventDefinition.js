import { cloneContent, shiftParent } from '../messageHelper.js';
import { ActivityError } from '../error/Errors.js';
import { ScriptCondition, ExpressionCondition } from '../condition.js';

const kExecuteMessage = Symbol.for('executeMessage');

export default function ConditionalEventDefinition(activity, eventDefinition, _context, index) {
  const { id, broker, environment } = activity;

  const { type = 'ConditionalEventDefinition', behaviour = {} } = eventDefinition;
  this.id = id;
  this.type = type;
  this.behaviour = behaviour;
  this.activity = activity;
  this.environment = environment;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  this.condition = this.getCondition(index);
}

Object.defineProperty(ConditionalEventDefinition.prototype, 'executionId', {
  get() {
    return this[kExecuteMessage]?.content.executionId;
  },
});

ConditionalEventDefinition.prototype.execute = function execute(executeMessage) {
  this[kExecuteMessage] = executeMessage;

  if (!this.condition) return this._setup(executeMessage);

  this.evaluate(executeMessage, (err, result) => {
    this.evaluateCallback(err, result);
    if (!err && !result) {
      this._setup(executeMessage);
    }
  });
};

ConditionalEventDefinition.prototype._setup = function setup(executeMessage) {
  const broker = this.broker;
  const executeContent = executeMessage.content;
  const { executionId, parent } = executeContent;
  const parentExecutionId = parent.executionId;

  const onApiMessage = this._onApiMessage.bind(this);
  broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_api-${executionId}`,
  });
  broker.subscribeTmp('api', `activity.#.${parentExecutionId}`, onApiMessage, {
    noAck: true,
    consumerTag: `_parent-signal-${executionId}`,
  });
  broker.subscribeTmp('api', '#.signal.*', this._onDelegateApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-delegated-${executionId}`,
  });

  const waitContent = cloneContent(executeContent, {
    executionId: parentExecutionId,
    ...(this.condition && { condition: this.condition.type }),
  });
  waitContent.parent = shiftParent(parent);

  broker.publish('event', 'activity.wait', waitContent);
};

/**
 * Evaluate condition
 * @param {import('types').ElementBrokerMessage} message
 * @param {CallableFunction} callback
 */
ConditionalEventDefinition.prototype.evaluate = function evaluate(message, callback) {
  const condition = this.condition;
  if (!condition) {
    this._debug(`condition is empty <${condition}>`);
    return callback();
  }

  condition.execute(message, callback);
};

/**
 * Handle evaluate result or error
 * @param {Error|null} err Condition evaluation error
 * @param {any} result Result from evaluated condition, completes execution if truthy
 */
ConditionalEventDefinition.prototype.evaluateCallback = function evaluateCallback(err, result) {
  const broker = this.broker;
  const executeMessage = this[kExecuteMessage];
  const executeContent = executeMessage.content;

  if (err) {
    return broker.publish(
      'execution',
      'execute.error',
      cloneContent(executeContent, { error: new ActivityError(err.message, executeMessage, err) }, { mandatory: true })
    );
  }

  this._debug(`condition evaluated to ${!!result}`);

  this.broker.publish(
    'event',
    'activity.condition',
    cloneContent(this[kExecuteMessage].content, {
      conditionResult: result,
    })
  );

  if (!result) return;

  this._stop();
  return broker.publish('execution', 'execute.completed', cloneContent(executeContent, { output: result }));
};

/**
 * Get condition
 * @param {number} index Eventdefinition sequence number, used to name registered script
 * @returns {ExpressionCondition|ScriptCondition|null}
 */
ConditionalEventDefinition.prototype.getCondition = function getCondition(index) {
  const behaviour = this.behaviour;

  if (behaviour.script) {
    const { language, body, resource } = behaviour.script;

    const scriptId = `${this.id}/${index}`;

    const script = this.environment.scripts.register({
      id: scriptId,
      type: this.type,
      environment: this.environment,
      behaviour: {
        scriptFormat: language,
        ...(body && { script: body }),
        ...(resource && { resource }),
      },
    });

    if (script) {
      return new ScriptCondition(this, script, language);
    }
  } else if (behaviour.expression) {
    return new ExpressionCondition(this, behaviour.expression);
  }
};

ConditionalEventDefinition.prototype._onDelegateApiMessage = function onDelegateApiMessage(routingKey, message) {
  if (message.content.message?.id === this.id) {
    this._onApiMessage(routingKey, message);
  }
};

ConditionalEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  const messageType = message.properties.type;

  switch (messageType) {
    case 'signal': {
      if (!this.condition) break;
      return this.evaluate(message, (err, result) => this.evaluateCallback(err, result));
    }
    case 'discard': {
      this._stop();
      this._debug('discarded');
      return this.broker.publish('execution', 'execute.discard', cloneContent(this[kExecuteMessage].content, { state: 'discard' }));
    }
    case 'stop': {
      this._stop();
      return this._debug('stopped');
    }
  }
};

ConditionalEventDefinition.prototype._stop = function stop() {
  const executionId = this.executionId;
  const broker = this.broker;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_parent-signal-${executionId}`);
  broker.cancel(`_api-delegated-${executionId}`);
};

ConditionalEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};
