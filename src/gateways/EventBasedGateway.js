import Activity from '../activity/Activity';
import {cloneContent} from '../messageHelper';

export default function EventBasedGateway(activityDef, context) {
  return Activity(EventBasedGatewayBehaviour, {...activityDef}, context);
}

export function EventBasedGatewayBehaviour(activity, context) {
  const {id, type, broker, logger, outbound: outboundSequenceFlows = []} = activity;
  let executing = false;

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const isRedelivered = executeMessage.fields.redelivered;
    const content = executeMessage.content;
    const {executionId, outbound = [], outboundTaken} = content;

    const targets = [];
    for (let i = 0; i < outboundSequenceFlows.length; i++) {
      const flow = outboundSequenceFlows[i];
      targets.push(context.getActivityById(flow.targetId));
      outbound.push({id: flow.id, action: 'take'});
    }

    if (!targets.length) return complete(content);

    if (executing && outboundTaken) return;

    const targetConsumerTag = `_gateway-listener-${id}`;

    targets.forEach((target) => {
      target.broker.subscribeOnce('event', 'activity.end', onTargetCompleted, {consumerTag: targetConsumerTag});
    });

    broker.subscribeOnce('api', `activity.stop.${executionId}`, stop, {noAck: true, consumerTag: `_api-stop-${executionId}`});

    executing = true;
    if (!isRedelivered) return broker.publish('execution', 'execute.outbound.take', cloneContent(content, {outboundTaken: true}));

    function onTargetCompleted(_, message, owner) {
      const {id: targetId, exexutionId: targetExecutionId} = message.content;
      logger.debug(`<${executionId} (${id})> <${targetExecutionId}> completed run, discarding the rest`);
      targets.forEach((target) => {
        if (target === owner) return;
        target.broker.cancel(targetConsumerTag);
        target.discard();
      });

      const completedContent = cloneContent(executeMessage.content, {taken: {
        id: targetId,
        executionId: targetExecutionId,
      }, ignoreOutbound: true});

      complete(completedContent);
    }

    function complete(completedContent) {
      broker.publish('execution', 'execute.completed', completedContent);
    }

    function stop() {
      executing = false;
      targets.forEach((target) => {
        target.broker.cancel(targetConsumerTag);
      });
      broker.cancel(`_api-stop-${executionId}`);
    }
  }
}

