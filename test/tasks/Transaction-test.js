import Transaction from '../../src/tasks/Transaction.js';
import testHelpers from '../helpers/testHelpers.js';

describe('Transaction', () => {
  it('decorates activity with isTransaction', () => {
    const transaction = Transaction({id: 'sub-process', parent: {id: 'atomic'}}, testHelpers.emptyContext());
    expect(transaction).to.have.property('isTransaction', true);
  });

  describe('compensate by api cancel transaction', () => {
    let context;
    beforeEach(async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <sequenceFlow id="to-wait" sourceRef="task" targetRef="wait" />
            <userTask id="wait" />
          </transaction>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    it('compensate event definition detaches from monitored activity and completes when transaction is cancelled by api', () => {
      const [bp] = context.getProcesses();

      bp.run();
      const transaction = bp.getActivityById('atomic');

      const [api, monitor, userTask] = transaction.getApi().getPostponed();
      expect(monitor.id).to.equal('monitor');
      expect(userTask.id).to.equal('wait');

      api.cancel();

      expect(transaction.isRunning).to.be.false;

      expect(monitor.owner.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});
      expect(userTask.owner.counters, 'user task').to.deep.equal({taken: 0, discarded: 1});
      expect(api.owner.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
    });

    it('compensate event definition is discarded when transaction completes', () => {
      const [bp] = context.getProcesses();

      bp.run();
      const transaction = bp.getActivityById('atomic');

      const [, monitor, userTask] = transaction.getApi().getPostponed();
      expect(monitor.id).to.equal('monitor');
      expect(userTask.id).to.equal('wait');

      userTask.signal();

      expect(transaction.isRunning).to.be.false;

      expect(monitor.owner.counters, 'compensate event definition').to.deep.equal({taken: 0, discarded: 1});
      expect(userTask.owner.counters, 'user task').to.deep.equal({taken: 1, discarded: 0});
    });
  });

  describe('compensate by cancel event definition', () => {
    it('compensation completes when transaction is cancelled by cancel event definition', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});

      const end = transaction.execution.source.execution.getActivityById('cancel');
      expect(end.counters, 'end event').to.deep.equal({taken: 1, discarded: 0});
    });

    it('compensating task completes when transactions is cancelled', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <task id="compensate" isForCompensation="true" />
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;
      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate task').to.deep.equal({taken: 1, discarded: 0});
    });

    it('multi-instance monitored compensating task completes when transactions is cancelled', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task">
              <multiInstanceLoopCharacteristics isSequential="false">
                <loopCardinality>3</loopCardinality>
              </multiInstanceLoopCharacteristics>
            </task>
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;

      const compensations = [];
      const context = await testHelpers.context(source, {
        services: {
          compensate(...args) {
            compensations.push(args.shift().content.message);
            args.pop()();
          },
        },
      });

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate task taken').to.deep.equal({taken: 4, discarded: 0});
    });

    it('transaction completes when compensation has completed', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;

      const compensations = [];
      const context = await testHelpers.context(source, {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
        },
      });

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.false;

      compensations.pop().pop()();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate task taken').to.deep.equal({taken: 1, discarded: 0});
    });
  });

  describe('transaction cancel event definition listener', () => {
    it('cancel listener completes when transactions is cancelled', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <task id="compensate" isForCompensation="true" />
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const cancelled = bp.getActivityById('cancelled');
      expect(cancelled.counters, 'cancelled boundary event').to.deep.equal({taken: 1, discarded: 0});

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;
    });

    it('transaction cancel listener completes when transaction compensations has completed', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-cancel" sourceRef="task" targetRef="cancel" />
            <endEvent id="cancel">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const compensations = [];
      const context = await testHelpers.context(source, {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
        },
      });

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.false;

      compensations.pop().pop()();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 1, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate task taken').to.deep.equal({taken: 1, discarded: 0});

      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const cancelled = bp.getActivityById('cancelled');
      expect(cancelled.counters, 'cancelled boundary event').to.deep.equal({taken: 1, discarded: 0});
    });

    it('transaction cancel listener is discarded when transaction completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
            <endEvent id="end" />
          </transaction>
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const compensations = [];
      const context = await testHelpers.context(source, {
        services: {
          compensate(...args) {
            compensations.push(args);
          },
        },
      });

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'compensate event definition').to.deep.equal({taken: 0, discarded: 1});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate task ignored').to.deep.equal({taken: 0, discarded: 0});

      expect(transaction.counters, 'transaction').to.deep.equal({taken: 1, discarded: 0});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const cancelled = bp.getActivityById('cancelled');
      expect(cancelled.counters, 'cancelled boundary event').to.deep.equal({taken: 0, discarded: 1});
    });
  });

  describe('transaction error', () => {
    it('transaction error listener completes when transactions is errored', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <endEvent id="error">
              <errorEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const errored = bp.getActivityById('errored');
      expect(errored.counters, 'error boundary event').to.deep.equal({taken: 1, discarded: 0});

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;
    });

    it('error listener completes and cancel listener discards when transactions is errored', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <endEvent id="error">
              <errorEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const errored = bp.getActivityById('errored');
      expect(errored.counters, 'error boundary event').to.deep.equal({taken: 1, discarded: 0});

      const cancelled = bp.getActivityById('cancelled');
      expect(cancelled.counters, 'cancel boundary event').to.deep.equal({taken: 0, discarded: 1});
    });

    it('error listener and cancel listener discards when transactions completes', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <endEvent id="end" />
          </transaction>
          <boundaryEvent id="cancelled" attachedToRef="atomic">
            <cancelEventDefinition />
          </boundaryEvent>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 1, discarded: 0});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const errored = bp.getActivityById('errored');
      expect(errored.counters, 'error boundary event').to.deep.equal({taken: 0, discarded: 1});

      const cancelled = bp.getActivityById('cancelled');
      expect(cancelled.counters, 'cancel boundary event').to.deep.equal({taken: 0, discarded: 1});
    });

    it('compensate listener is discarded when transactions is errored', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-error" sourceRef="task" targetRef="error" />
            <endEvent id="error">
              <errorEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="errored" attachedToRef="atomic">
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const errored = bp.getActivityById('errored');
      expect(errored.counters, 'error boundary event').to.deep.equal({taken: 1, discarded: 0});

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 0, discarded: 1});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'monitor ignored').to.deep.equal({taken: 0, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate service ignored').to.deep.equal({taken: 0, discarded: 0});
    });
  });

  describe('transaction error end event', () => {
    it('uncaught transaction error end event completes transaction', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-gw" sourceRef="task" targetRef="gw" />
            <exclusiveGateway id="gw" default="to-end" />
            <sequenceFlow id="to-end" sourceRef="gw" targetRef="end" />
            <endEvent id="end" />
            <sequenceFlow id="to-error" sourceRef="gw" targetRef="error">
              <conditionExpression xsi:type="tFormalExpression">\${true}</conditionExpression>
            </sequenceFlow>
            <endEvent id="error">
              <errorEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 1, discarded: 0});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const end = transaction.execution.source.execution.getActivityById('error');
      expect(end.counters, 'error end event').to.deep.equal({taken: 1, discarded: 0});

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'monitor discarded').to.deep.equal({taken: 0, discarded: 1});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate service ignored').to.deep.equal({taken: 0, discarded: 0});
    });
  });

  describe('transaction terminate end event', () => {
    it('terminate end event completes transaction', async () => {
      const source = `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="Process_0" isExecutable="true">
          <transaction id="atomic">
            <task id="task" />
            <boundaryEvent id="monitor" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="forward" sourceRef="monitor" targetRef="compensate" />
            <serviceTask id="compensate" isForCompensation="true" implementation="\${environment.services.compensate}" />
            <sequenceFlow id="to-gw" sourceRef="task" targetRef="gw" />
            <exclusiveGateway id="gw" default="to-end" />
            <sequenceFlow id="to-end" sourceRef="gw" targetRef="end" />
            <endEvent id="end" />
            <sequenceFlow id="to-error" sourceRef="gw" targetRef="error">
              <conditionExpression xsi:type="tFormalExpression">\${true}</conditionExpression>
            </sequenceFlow>
            <endEvent id="error">
              <terminateEventDefinition />
            </endEvent>
          </transaction>
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);

      const [bp] = context.getProcesses();

      bp.run();

      expect(bp.execution.completed).to.be.true;

      const transaction = bp.execution.getActivityById('atomic');
      expect(transaction.counters, 'transaction').to.deep.equal({taken: 1, discarded: 0});
      expect(transaction.execution.completed, 'transaction').to.be.true;

      const end = transaction.execution.source.execution.getActivityById('error');
      expect(end.counters, 'terminate end event').to.deep.equal({taken: 1, discarded: 0});

      const monitor = transaction.execution.source.execution.getActivityById('monitor');
      expect(monitor.counters, 'monitor ignored').to.deep.equal({taken: 0, discarded: 0});

      const compensate = transaction.execution.source.execution.getActivityById('compensate');
      expect(compensate.counters, 'compensate service ignored').to.deep.equal({taken: 0, discarded: 0});
    });
  });
});
