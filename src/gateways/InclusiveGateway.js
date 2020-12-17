import Activity from '../activity/Activity';
import {ActivityError} from '../error/Errors';
import {cloneContent, cloneMessage} from '../messageHelper';

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

    return activity.evaluateOutbound(cloneMessage(executeMessage), false, complete);

    function complete(err, outbound) {
      if (err) {
        const error = new ActivityError(err.message, executeMessage, err);
        return broker.publish('execution', 'execute.error', {...content, error});
      }
      if (!outbound) return broker.publish('execution', 'execute.completed', content);

      const taken = outbound.find(({action}) => action === 'take');
      if (!taken) {
        const error = new ActivityError(`<${id}> no conditional flow taken`, executeMessage);
        logger.error(`<${id}>`, err);
        return broker.publish('execution', 'execute.error', {...content, error});
      }

      if (taken.isDefault) {
        logger.debug(`<${id}> take default flow <${taken.id}>`);
      }

      return broker.publish('execution', 'execute.completed', {...content, outbound});
    }
  }
}
