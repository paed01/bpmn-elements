import { Activity } from '../activity/Activity.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';
import { K_EXECUTE_MESSAGE, K_TARGETS } from '../constants.js';

const STATE_MONTITORING = 'monitoring';
const STATE_SETUP = 'setup';

const K_PEERS = Symbol.for('peers');
const K_PEERS_DISCOVERED = Symbol.for('peers discovered');

/**
 * Parallel gateway
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function ParallelGateway(activityDef, context) {
  const activity = new Activity(ParallelGatewayBehaviour, { ...activityDef, isParallelGateway: true }, context);

  const id = (this.id = activity.id);

  activity.broker.cancel('_api-shake');
  activity.broker.subscribeTmp('api', 'activity.shake.continue', onApiShake, { noAck: true, consumerTag: '_api-shake', priority: 1000 });

  const peers = (activity[K_PEERS] = new Map(activity.inbound.map(({ id: flowId, sourceId }) => [flowId, new Set([sourceId])])));

  const cachedPeers = context.getShakenPeers(id);
  if (cachedPeers) {
    for (const [flowId, sourceIds] of cachedPeers) {
      let peer = peers.get(flowId);
      if (!peer) peers.set(flowId, (peer = new Set()));
      for (const sourceId of sourceIds) peer.add(sourceId);
    }
    activity[K_PEERS_DISCOVERED] = true;
  }

  return activity;

  function onApiShake(_, message) {
    const collect = new Set();

    let sequenceFlow;
    for (const s of message.content.sequence) {
      if (s.isSequenceFlow) {
        sequenceFlow = s;
      } else if (s.id === id) {
        const peer = peers.get(sequenceFlow.id);
        for (const c of collect) {
          peer.add(c);
        }
        collect.clear();
      } else {
        collect.add(s.id);
      }
    }

    activity.logger.debug(`<${activity.id}> collected parallel gateway peers`);

    activity[K_PEERS_DISCOVERED] = true;
    context.setShakenPeers(
      id,
      [...peers].map(([flowId, sourceIds]) => [flowId, [...sourceIds]])
    );

    activity.shake(message);
  }
}

/**
 * Parallel gateway behaviour
 * @param {import('#types').Activity} activity
 */
export function ParallelGatewayBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  /**
   * Inbound taken sequence flow sequences
   * @type {Set<import('#types').ElementMessageContent}
   */
  this.inbound = new Set();

  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
  /** @internal */
  this[K_TARGETS] = undefined;
}

Object.defineProperty(ParallelGatewayBehaviour.prototype, 'executionId', {
  /** @returns {string | undefined} */
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ParallelGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;

  if (executeContent.isRootScope) {
    this[K_EXECUTE_MESSAGE] = executeMessage;

    if (executeMessage.fields.routingKey === 'execute.start') {
      const isRedelivered = executeMessage.fields.redelivered;
      if (!isRedelivered && executeContent.state === STATE_SETUP && !this.peerMonitor.isRunning) {
        return this._complete();
      }
      if (executeContent.state !== 'start' && !isRedelivered) {
        return;
      }
      return this.setup(executeMessage);
    }
  }
};

/**
 * Setup peer monitor
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
ParallelGatewayBehaviour.prototype.setup = function setup(executeMessage) {
  const peerIds = new Set([...this.activity[K_PEERS].values()].map((v) => [...v]).flat());
  this[K_TARGETS] = new Map([...peerIds].map((pid) => [pid, this.activity.getActivityById(pid)]));

  this.peerMonitor = new PeerMonitor(this.activity, this[K_TARGETS]);

  const message = (this[K_EXECUTE_MESSAGE] = cloneMessage(executeMessage));
  const executeContent = message.content;
  const { executionId } = executeContent;

  this.inbound.add(cloneContent(executeContent.inbound[0]));

  this.broker.subscribeOnce('api', `activity.stop.${executionId}`, () => this._stop(), {
    consumerTag: '_api-stop-execution',
  });

  this.broker.subscribeTmp('execution', 'execute.completed', this._onExecuteMessage.bind(this), {
    noAck: true,
    consumerTag: '_parallel-execution-execute-tag',
  });

  this.broker.subscribeTmp('execution', 'execute.start', this._onPeerEnterMessage.bind(this), {
    noAck: true,
    consumerTag: '_parallel-execution-peer-enter-tag',
  });

  this.peerMonitor.execute(message);

  const inboundQ = this.broker.getQueue('inbound-q');
  inboundQ.consume(
    (_, inboundMessage) => {
      this.inbound.add(inboundMessage);

      message.content.inbound.push(cloneContent(inboundMessage.content));

      this.peerMonitor.execute(message);
    },
    { consumerTag: '_converging-inbound', exclusive: true, prefetch: 10000 }
  );

  this.broker.publish('event', 'activity.converge', cloneContent(executeContent));

  this.broker.publish('execution', 'execute.start', cloneContent(executeMessage.content, { preventComplete: true, state: STATE_SETUP }));
};

ParallelGatewayBehaviour.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  this.activity.logger.debug(`<${this.executionId} (${this.id})> received completed from <${message.content.id}>`);
  if (this.peerMonitor._onCompleteMessage(routingKey, message)) {
    return this._complete();
  }
};

ParallelGatewayBehaviour.prototype._onPeerEnterMessage = function onPeerEnterMessage(_, message) {
  if (!message.properties.monitor) return;
  const peer = this.peerMonitor.watching.get(message.content.id);
  if (peer) this.peerMonitor.running.set(message.content.id, peer);
};

ParallelGatewayBehaviour.prototype._complete = function complete() {
  this.broker.cancel('_converging-inbound', false);

  this._stop();

  this.activity.logger.debug(`<${this.executionId} (${this.id})> completed monitoring`);

  const content = cloneContent(this[K_EXECUTE_MESSAGE].content, { isRootScope: true, state: 'completed' });
  content.inbound = this.peerMonitor.inbound;

  return this.broker.publish('execution', 'execute.completed', content);
};

ParallelGatewayBehaviour.prototype._stop = function stop() {
  this.broker.cancel('_converging-inbound');
  this.broker.cancel('_api-stop-execution');
  this.broker.cancel('_parallel-execution-execute-tag');
  this.broker.cancel('_parallel-execution-peer-enter-tag');
  this.peerMonitor.stop();
};

/**
 * Peer monitor
 * @param {import('#types').Activity} activity parallel gateway activity
 * @param {Map<string, import('#types').Activity} targets parallel gateway peer target activities
 */
function PeerMonitor(activity, targets) {
  this.activity = activity;
  this.id = activity.id;
  this.broker = activity.broker;
  this.running = new Map();
  this.watching = new Map();
  this.targets = targets;
  this.inbound = [];
}

Object.defineProperty(PeerMonitor.prototype, 'isRunning', {
  get() {
    return this.running.size > 0;
  },
});

/**
 * Execute peer monitor
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {number} number of running peers
 */
PeerMonitor.prototype.execute = function execute(executeMessage) {
  const message = cloneMessage(executeMessage);
  const inbound = message.content.inbound.pop();
  this.inbound.push(cloneContent(inbound));

  this.activity.logger.debug(`<${executeMessage.content.executionId} (${this.id})> start monitoring inbound <${inbound.id}> peers`);

  this.activity.broker.publish('execution', 'execute.start', {
    ...cloneContent(executeMessage.content),
    inbound: this.inbound.slice(),
    state: STATE_MONTITORING,
    preventComplete: true,
  });

  for (const target of this.targets.values()) {
    this.monitor(target);
  }

  return this.running.size;
};

/**
 * Monitor peer activity
 * @param {import('#types').Activity} peerActivity
 */
PeerMonitor.prototype.monitor = function monitor(peerActivity) {
  if (this.watching.has(peerActivity.id)) return;

  this.activity.logger.debug(`<${this.id}> monitor <${peerActivity.id}> with status: ${peerActivity.status}`);

  this.watching.set(peerActivity.id, peerActivity);

  if (peerActivity.status || peerActivity.initialized) {
    this.running.set(peerActivity.id, peerActivity);
  }

  peerActivity.broker.createShovel(
    `_on-enter-${this.id}`,
    {
      exchange: 'event',
      pattern: 'activity.enter',
    },
    {
      broker: this.broker,
      exchange: 'execution',
      exchangeKey: 'execute.start',
      publishProperties: {
        monitor: true,
      },
    },
    {
      cloneMessage(sourceMessage) {
        return cloneMessage(sourceMessage, { isRootScope: false });
      },
    }
  );

  peerActivity.broker.createShovel(
    `_on-leave-${this.id}`,
    {
      exchange: 'event',
      pattern: 'activity.leave',
    },
    {
      broker: this.broker,
      exchange: 'execution',
      exchangeKey: 'execute.completed',
      publishProperties: {
        monitor: true,
      },
    },
    {
      cloneMessage(sourceMessage) {
        return cloneMessage(sourceMessage, { isRootScope: false, preventComplete: true });
      },
    }
  );
};

PeerMonitor.prototype._onCompleteMessage = function onCompleteMessage(_routingKey, message) {
  this.running.delete(message.content.id);

  return !this.running.size;
};

PeerMonitor.prototype.stop = function stop() {
  for (const peerActivity of this.watching.values()) {
    peerActivity.broker.closeShovel(`_on-leave-${this.id}`);
    peerActivity.broker.closeShovel(`_on-enter-${this.id}`);
  }
};
