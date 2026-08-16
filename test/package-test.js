import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const nodeRequire = createRequire(fileURLToPath(import.meta.url));

const pkg = nodeRequire('../package.json');
const cwd = process.cwd();

describe('package exports', () => {
  describe('events', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./events'].import));
      expect(Object.keys(modules)).to.have.same.members([
        'BoundaryEvent',
        'BoundaryEventBehaviour',
        'EndEvent',
        'EndEventBehaviour',
        'IntermediateCatchEvent',
        'IntermediateCatchEventBehaviour',
        'IntermediateThrowEvent',
        'IntermediateThrowEventBehaviour',
        'StartEvent',
        'StartEventBehaviour',
      ]);
    });
  });

  describe('event definitions', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./eventDefinitions'].import));
      expect(Object.keys(modules)).to.have.same.members([
        'CancelEventDefinition',
        'CompensateEventDefinition',
        'ConditionalEventDefinition',
        'ErrorEventDefinition',
        'EscalationEventDefinition',
        'LinkEventDefinition',
        'MessageEventDefinition',
        'SignalEventDefinition',
        'TerminateEventDefinition',
        'TimerEventDefinition',
        'EventDefinitionExecution',
      ]);
    });

    it('commonjs exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./eventDefinitions'].require));
      expect(Object.keys(modules)).to.include.members([
        'CancelEventDefinition',
        'CompensateEventDefinition',
        'ConditionalEventDefinition',
        'ErrorEventDefinition',
        'EscalationEventDefinition',
        'LinkEventDefinition',
        'MessageEventDefinition',
        'SignalEventDefinition',
        'TerminateEventDefinition',
        'TimerEventDefinition',
      ]);
    });
  });

  describe('flows', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./flows'].import));
      expect(Object.keys(modules)).to.have.same.members(['Association', 'MessageFlow', 'SequenceFlow']);
    });
  });

  describe('gateways', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./gateways'].import));
      expect(Object.keys(modules)).to.have.same.members([
        'EventBasedGateway',
        'EventBasedGatewayBehaviour',
        'ExclusiveGateway',
        'ExclusiveGatewayBehaviour',
        'InclusiveGateway',
        'InclusiveGatewayBehaviour',
        'ParallelGateway',
        'ParallelGatewayBehaviour',
      ]);
    });
  });

  describe('root', () => {
    it('exports Expressions, the default environment expression handler', async () => {
      const modules = await import(resolve(cwd, pkg.exports['.'].import));

      expect(modules).to.have.property('Expressions').that.is.a('function');

      const expressions = modules.Expressions();
      expect(expressions.resolveExpression('${content.id}', { content: { id: 'element_1' } })).to.equal('element_1');
    });
  });

  describe('tasks', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./tasks'].import));
      expect(Object.keys(modules)).to.have.same.members([
        'AdHocSubProcess',
        'AdHocSubProcessBehaviour',
        'BusinessRuleTask',
        'BusinessRuleTaskBehaviour',
        'CallActivity',
        'CallActivityBehaviour',
        'ManualTask',
        'ManualTaskBehaviour',
        'ReceiveTask',
        'ReceiveTaskBehaviour',
        'ScriptTask',
        'ScriptTaskBehaviour',
        'SendTask',
        'SendTaskBehaviour',
        'ServiceTask',
        'ServiceTaskBehaviour',
        'SignalTask',
        'SignalTaskBehaviour',
        'SubProcess',
        'SubProcessBehaviour',
        'Task',
        'TaskBehaviour',
        'Transaction',
        'UserTask',
        'UserTaskBehaviour',
      ]);
    });
  });
});
