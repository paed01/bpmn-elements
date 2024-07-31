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
      expect(Object.keys(modules)).to.deep.equal([
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
      expect(Object.keys(modules)).to.deep.equal([
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

    it('commonjs exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./eventDefinitions'].require));
      expect(Object.keys(modules)).to.deep.include(
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
      );
    });
  });

  describe('gateways', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./gateways'].import));
      expect(Object.keys(modules)).to.deep.equal([
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

  describe('tasks', () => {
    it('exports expected', async () => {
      const modules = await import(resolve(cwd, pkg.exports['./tasks'].import));
      expect(Object.keys(modules)).to.deep.equal([
        'CallActivity',
        'CallActivityBehaviour',
        'ReceiveTask',
        'ReceiveTaskBehaviour',
        'ScriptTask',
        'ScriptTaskBehaviour',
        'ServiceTask',
        'ServiceTaskBehaviour',
        'SignalTask',
        'SignalTaskBehaviour',
        'SubProcess',
        'SubProcessBehaviour',
        'Task',
        'TaskBehaviour',
        'Transaction',
      ]);
    });
  });
});
