import {cloneContent, shiftParent} from '../messageHelper';

export default function TerminateEventDefinition(activity, eventDefinition = {}) {
  const {id, broker, environment} = activity;
  const {type = 'terminateeventdefinition'} = eventDefinition;
  const {debug} = environment.Logger(type.toLowerCase());

  const source = {
    id,
    type,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = cloneContent(executeMessage.content);
    const terminateContent = cloneContent(content);
    terminateContent.parent = shiftParent(terminateContent.parent);
    terminateContent.state = 'terminate';

    debug(`<${content.executionId} (${content.id})> terminate`);
    broker.publish('event', 'process.terminate', terminateContent, {type: 'terminate'});
    broker.publish('execution', 'execute.completed', content);
  }
}
