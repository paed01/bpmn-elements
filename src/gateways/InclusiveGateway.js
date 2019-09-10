import Activity from '../activity/Activity';
import {ActivityError} from '../error/Errors';
import {cloneContent} from '../messageHelper';

export default function InclusiveGateway(activityDef, context) {
  return Activity(InclusiveGatewayBehaviour, activityDef, context);
}

export function InclusiveGatewayBehaviour(activity) {
  const {id, type, broker, logger, outbound: outboundSequenceFlows = []} = activity;

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = cloneContent(executeMessage.content);
    if (!outboundSequenceFlows.length) return complete();

    let conditionMet, defaultFlow, evaluateError;
    const outbound = content.outbound = [];

    for (let i = 0; i < outboundSequenceFlows.length; i++) {
      const flow = outboundSequenceFlows[i];

      if (flow.isDefault) {
        defaultFlow = flow;
        continue;
      }

      if (flow.evaluateCondition(executeMessage, onEvaluateError)) {
        conditionMet = true;
        outbound.push({id: flow.id, action: 'take'});
      } else {
        if (evaluateError) return broker.publish('execution', 'execute.error', cloneContent(content, {error: evaluateError}));
        outbound.push({id: flow.id, action: 'discard'});
      }
    }

    if (defaultFlow) {
      if (conditionMet) {
        outbound.push({id: defaultFlow.id, action: 'discard'});
      } else {
        logger.debug(`<${id}> take default flow`);
        outbound.push({id: defaultFlow.id, action: 'take'});
      }
    } else if (!conditionMet) {
      const err = new ActivityError(`<${id}> no conditional flow taken`, executeMessage);
      logger.error(`<${id}>`, err);
      return broker.publish('execution', 'execute.error', cloneContent(content, {error: err}));
    }

    return complete();

    function complete() {
      broker.publish('execution', 'execute.completed', cloneContent(content));
    }

    function onEvaluateError(err) {
      evaluateError = err;
    }
  }
}
