import Activity from '../activity/Activity.js';
import { cloneContent, cloneMessage } from '../messageHelper.js';

const STATE_MONTITORING = 'monitoring';
const STATE_SETUP = 'setup';

const kPeers = Symbol.for('peers');
const kInboundSourceIds = Symbol.for('inbound peers');
const kTargets = Symbol.for('targets');
const kExecuteMessage = Symbol.for('executeMessage');

export default function ParallelGateway(activityDef, context) {
  const activity = new Activity(ParallelGatewayBehaviour, { ...activityDef, isParallelGateway: true }, context);

  const id = (this.id = activity.id);

  activity.broker.cancel('_api-shake');
  activity.broker.subscribeTmp('api', 'activity.shake.continue', onApiShake, { noAck: true, consumerTag: '_api-shake', priority: 1000 });

  const peers = (activity[kPeers] = new Map(activity.inbound.map(({ id: flowId, sourceId }) => [flowId, new Set([sourceId])])));

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

    activity.shake(message);
  }
}

export function ParallelGatewayBehaviour(activity) {
  this.id = activity.id;
  this.type = activity.type;
  this.activity = activity;
  this.broker = activity.broker;
  this.inbound = new Set();

  this.isConverging = new Set(activity.inbound.map(({ sourceId }) => sourceId)).size > 1;
  this[kExecuteMessage] = undefined;
}

Object.defineProperties(ParallelGatewayBehaviour.prototype, {
  executionId: {
    get() {
      return this[kExecuteMessage]?.content.executionId;
    },
  },
});

ParallelGatewayBehaviour.prototype.execute = function execute(executeMessage) {
  const routingKey = executeMessage.fields.routingKey;
  const isRedelivered = executeMessage.fields.redelivered;
  const executeContent = executeMessage.content;

  if (executeContent.isRootScope) {
    this[kExecuteMessage] = executeMessage;

    switch (routingKey) {
      case 'execute.start': {
        if (!isRedelivered && executeContent.state === STATE_SETUP && !this.peerMonitor.isRunning) {
          return this._complete();
        }
        if (executeContent.state !== 'start' && !isRedelivered) {
          return;
        }
        return this.setup(executeMessage);
      }
    }
  }
};

ParallelGatewayBehaviour.prototype.setup = function setup(executeMessage) {
  const peerIds = new Set([...this.activity[kPeers].values()].map((v) => [...v]).flat());
  this[kTargets] = new Map([...peerIds].map((pid) => [pid, this.activity.getActivityById(pid)]));

  this.peerMonitor = new PeerMonitor(this.activity, this.activity[kInboundSourceIds], this[kTargets]);

  const message = (this[kExecuteMessage] = cloneMessage(executeMessage));
  const executeContent = message.content;
  const { executionId } = executeContent;

  this.inbound.add(cloneContent(executeMessage.content.inbound[0]));

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

  if (this.isConverging) {
    this.broker.publish('event', 'activity.converge', cloneContent(executeContent));
  }

  return this.broker.publish(
    'execution',
    'execute.start',
    cloneContent(executeMessage.content, { preventComplete: true, state: STATE_SETUP })
  );
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
  const take = this.peerMonitor.inbound.some(({ action }) => action === 'take');

  this.broker.cancel('_converging-inbound', false);

  this._stop();

  const state = take ? 'completed' : 'discard';

  this.activity.logger.debug(`<${this.executionId} (${this.id})> completed monitoring with state: ${state}`);

  const content = cloneContent(this[kExecuteMessage].content, { isRootScope: true, state });
  content.inbound = this.peerMonitor.inbound;

  return this.broker.publish('execution', `execute.${state}`, content);
};

ParallelGatewayBehaviour.prototype._stop = function stop() {
  this.broker.cancel('_converging-inbound');
  this.broker.cancel('_api-stop-execution');
  this.broker.cancel('_parallel-execution-execute-tag');
  this.broker.cancel('_parallel-execution-peer-enter-tag');
  this.peerMonitor.stop();
};

function PeerMonitor(activity, peers, targets) {
  this.activity = activity;
  this.id = activity.id;
  this.broker = activity.broker;
  this.running = 0;
  this.index = 0;
  this.discarded = 0;
  this.running = new Map();
  this.watching = new Map();
  this.peers = peers;
  this.targets = targets;
  this.touched = new Set();
  this.inbound = [];
}

Object.defineProperty(PeerMonitor.prototype, 'isRunning', {
  get() {
    return this.running.size > 0;
  },
});

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

  this.touched.add(inbound.sourceId);

  for (const target of this.targets.values()) {
    this.monitor(target);
  }

  return this.running.size;
};

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
