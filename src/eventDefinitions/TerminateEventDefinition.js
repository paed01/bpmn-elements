import {cloneContent} from '../messageHelper';

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
    content.state = 'terminate';
    debug(`<${content.executionId} (${content.id})> terminate`);
    broker.publish('event', 'process.terminate', cloneContent(content), {type: 'terminate'});
    broker.publish('execution', 'execute.completed', content);
  }
}
