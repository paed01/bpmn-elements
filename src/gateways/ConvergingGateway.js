import { Activity } from '../activity/Activity.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';
import { K_EXECUTE_MESSAGE, K_TARGETS } from '../constants.js';

const STATE_MONTITORING = 'monitoring';
const STATE_SETUP = 'setup';

const K_PEERS = Symbol.for('peers');
const K_PEERS_DISCOVERED = Symbol.for('peers discovered');

/**
 * Converging gateway
 *
 * Activity that discovers its upstream peers during the process shake and monitors them while converging.
 * A gateway with at most one incoming sequence flow has nothing to converge and fires on every inbound token.
 * @param {any} Behaviour gateway behaviour
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function ConvergingGateway(Behaviour, activityDef, context) {
  if (context.getInboundSequenceFlows(activityDef.id).length < 2) return new Activity(Behaviour, activityDef, context);

  const activity = new Activity(Behaviour, { ...activityDef, isConvergingGateway: true }, context);

  const id = activity.id;

  activity.broker.cancel('_api-shake');
  activity.broker.subscribeTmp('api', 'activity.shake.continue', onApiShake, { noAck: true, consumerTag: '_api-shake', priority: 1000 });

  const peers = (activity[K_PEERS] = new Map(activity.inbound.map(({ id: flowId, sourceId }) => [flowId, new Set([sourceId])])));

  const cachedPeers = context.getShakenPeers(id);
  if (cachedPeers) {
    for (const [flowId, sourceIds] of cachedPeers) {
      const peer = peers.get(flowId);
      for (const sourceId of sourceIds) peer.add(sourceId);
    }
    activity[K_PEERS_DISCOVERED] = true;
  }

  return activity;

  function onApiShake(_, message) {
    const collect = new Set();
    const collectOnly = message.properties.collectOnly;

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

    activity.logger.debug(`<${activity.id}> collected converging gateway peers`);

    activity[K_PEERS_DISCOVERED] = true;
    context.setShakenPeers(
      id,
      [...peers].map(([flowId, sourceIds]) => [flowId, [...sourceIds]])
    );

    if (collectOnly) return;

    // @ts-ignore
    activity.shake(message);
  }
}

/**
 * Converging gateway behaviour
 *
 * Monitors the upstream peers discovered by the process shake and completes once they have all settled
 * @param {import('#types').Activity} activity
 */
export function ConvergingGatewayBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  /**
   * Inbound taken sequence flow sequences
   * @type {Set<import('#types').ElementMessageContent>}
   */
  this.inbound = new Set();

  /** @internal */
  this[K_EXECUTE_MESSAGE] = undefined;
  /** @internal */
  this[K_TARGETS] = undefined;
}

Object.defineProperty(ConvergingGatewayBehaviour.prototype, 'executionId', {
  /** @returns {string | undefined} */
  get() {
    return this[K_EXECUTE_MESSAGE]?.content.executionId;
  },
});

/**
 * @param {import('#types').ElementBrokerMessage} executeMessage
 * @returns {void}
 */
ConvergingGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  if (!executeContent.isRootScope) return;

  this[K_EXECUTE_MESSAGE] = executeMessage;

  if (!this.activity.isConvergingGateway) {
    // @ts-ignore
    return this.broker.publish('execution', 'execute.completed', this._getCompletedContent());
  }

  if (executeMessage.fields.routingKey === 'execute.start') {
    const isRedelivered = executeMessage.fields.redelivered;
    if (!isRedelivered && executeContent.state === STATE_SETUP && !this.peerMonitor.isRunning) {
      // @ts-ignore
      return this._complete();
    }
    if (executeContent.state !== 'start' && !isRedelivered) {
      return;
    }
    return this.setup(executeMessage);
  }
};

/**
 * Setup peer monitor
 * @param {import('#types').ElementBrokerMessage} executeMessage
 */
ConvergingGatewayBehaviour.prototype.setup = function setup(executeMessage) {
  const targets = (this[K_TARGETS] = new Map());
  const inboundFlows = executeMessage.content.inbound;
  const touched = new Set(inboundFlows.map(({ id: flowId }) => flowId));
  for (const [flowId, sourceIds] of this.activity[K_PEERS]) {
    collectPeerTargets(this.activity, this.id, sourceIds, targets, !touched.has(flowId));
  }

  this.peerMonitor = new PeerMonitor(this.activity, targets);

  const message = (this[K_EXECUTE_MESSAGE] = cloneMessage(executeMessage));
  const executeContent = message.content;
  const { executionId } = executeContent;

  this.inbound.add(cloneContent(inboundFlows[0]));

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

ConvergingGatewayBehaviour.prototype._onExecuteMessage = function onExecuteMessage(routingKey, message) {
  this.activity.logger.debug(`<${this.executionId} (${this.id})> received completed from <${message.content.id}>`);
  if (this.peerMonitor._onCompleteMessage(routingKey, message)) {
    return this._complete();
  }
};

ConvergingGatewayBehaviour.prototype._onPeerEnterMessage = function onPeerEnterMessage(_, message) {
  if (!message.properties.monitor) return;
  const peer = this.peerMonitor.watching.get(message.content.id);
  if (peer) this.peerMonitor.running.set(message.content.id, peer);
};

ConvergingGatewayBehaviour.prototype._complete = function complete() {
  this.broker.cancel('_converging-inbound', false);

  this._stop();

  this.activity.logger.debug(`<${this.executionId} (${this.id})> completed monitoring`);

  return this.broker.publish('execution', 'execute.completed', this._getCompletedContent());
};

/**
 * Completed execute message content
 * @returns {import('#types').ElementMessageContent}
 */
ConvergingGatewayBehaviour.prototype._getCompletedContent = function getCompletedContent() {
  const content = cloneContent(this[K_EXECUTE_MESSAGE].content, { isRootScope: true, state: 'completed' });
  if (this.peerMonitor) content.inbound = this.peerMonitor.inbound;
  return content;
};

ConvergingGatewayBehaviour.prototype._stop = function stop() {
  this.broker.cancel('_converging-inbound');
  this.broker.cancel('_api-stop-execution');
  this.broker.cancel('_parallel-execution-execute-tag');
  this.broker.cancel('_parallel-execution-peer-enter-tag');
  this.peerMonitor.stop();
};

/**
 * Collect peer target activities, optionally following upstream converging gateways so their peers are monitored too
 * @param {import('#types').Activity} gateway monitoring gateway
 * @param {string} rootId monitoring gateway id, never a target of itself
 * @param {Iterable<string>} peerIds peer activity ids
 * @param {Map<string, import('#types').Activity>} targets collected peer targets
 * @param {boolean} deep follow upstream converging gateway peers
 */
function collectPeerTargets(gateway, rootId, peerIds, targets, deep) {
  for (const peerId of peerIds) {
    if (peerId === rootId || targets.has(peerId)) continue;
    const peer = gateway.getActivityById(peerId);
    targets.set(peerId, peer);
    if (!deep || !peer[K_PEERS]) continue;
    for (const upstreamIds of peer[K_PEERS].values()) {
      collectPeerTargets(gateway, rootId, upstreamIds, targets, deep);
    }
  }
}

/**
 * Peer monitor
 * @param {import('#types').Activity} activity converging gateway activity
 * @param {Map<string, import('#types').Activity>} targets gateway peer target activities
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

  this.activity.logger.debug(`<${this.id}> monitor <${peerActivity.id}> with status: ${peerActivity.status ?? '[idle]'}`);

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
