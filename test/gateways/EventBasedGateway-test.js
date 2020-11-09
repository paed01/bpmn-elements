import testHelpers from '../helpers/testHelpers';

describe('EventBasedGateway', () => {
  describe('behavior', () => {
    it('completes immediately if used as end', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_155ehxd" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-decision" sourceRef="start" targetRef="decision" />
          <eventBasedGateway id="decision" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      bp.run();

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('closes target consumers when completed', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_155ehxd" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
          <task id="task" />
          <sequenceFlow id="to-decision" sourceRef="task" targetRef="decision" />
          <eventBasedGateway id="decision" />
          <sequenceFlow id="to-receive" sourceRef="decision" targetRef="receive" />
          <receiveTask id="receive" />
          <sequenceFlow id="to-wait" sourceRef="decision" targetRef="usertask" />
          <userTask id="usertask" />
          <sequenceFlow id="back-to-task" sourceRef="usertask" targetRef="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();

      bp.run();
      bp.signal({id: 'usertask'});

      expect(bp.counters).to.have.property('completed', 0);

      bp.signal({id: 'receive'});

      expect(bp.counters).to.have.property('completed', 1);
    });

    it('can be stopped and resumed', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_155ehxd" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
          <task id="task" />
          <sequenceFlow id="to-decision" sourceRef="task" targetRef="decision" />
          <eventBasedGateway id="decision" />
          <sequenceFlow id="to-receive" sourceRef="decision" targetRef="receive" />
          <receiveTask id="receive" />
          <sequenceFlow id="to-wait" sourceRef="decision" targetRef="usertask" />
          <userTask id="usertask" />
          <sequenceFlow id="back-to-task" sourceRef="usertask" targetRef="task" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp] = context.getProcesses();
      const gateway = bp.getActivityById('decision');
      const usertask = bp.getActivityById('usertask');
      const receive = bp.getActivityById('receive');

      bp.run();
      bp.signal({id: 'usertask'});

      expect(gateway.counters).to.have.property('taken', 1);

      bp.stop();

      bp.resume();

      expect(bp.counters).to.have.property('completed', 0);
      expect(gateway.counters, 'gateway').to.have.property('taken', 1);
      expect(usertask.counters, 'usertask').to.have.property('taken', 1);
      expect(receive.counters, 'receive').to.have.property('discarded', 1);

      bp.signal({id: 'usertask'});

      expect(bp.counters).to.have.property('completed', 0);
      expect(gateway.counters, 'gateway').to.have.property('taken', 2);
      expect(gateway.counters, 'gateway').to.have.property('discarded', 0);
      expect(usertask.counters, 'usertask').to.have.property('taken', 2);
      expect(receive.counters, 'receive').to.have.property('discarded', 2);

      bp.signal({id: 'receive'});

      expect(bp.counters).to.have.property('completed', 1);
      expect(gateway.counters, 'gateway').to.have.property('taken', 3);
      expect(gateway.counters, 'gateway').to.have.property('discarded', 1);
      expect(usertask.counters, 'usertask').to.have.property('taken', 2);
      expect(usertask.counters, 'usertask').to.have.property('discarded', 1);
      expect(receive.counters, 'receive').to.have.property('taken', 1);
      expect(receive.counters, 'receive').to.have.property('discarded', 3);
    });
  });

  describe('getState()', () => {
    it('save state on first succeeding wait event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_155ehxd" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process" isExecutable="true">
          <eventBasedGateway id="decision">
            <outgoing>to-receive</outgoing>
            <outgoing>to-wait</outgoing>
          </eventBasedGateway>
          <receiveTask id="receive">
            <incoming>to-receive</incoming>
          </receiveTask>
          <sequenceFlow id="to-receive" sourceRef="decision" targetRef="receive" />
          <userTask id="usertask">
            <incoming>to-wait</incoming>
          </userTask>
          <sequenceFlow id="to-wait" sourceRef="decision" targetRef="usertask" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp1] = context.getProcesses();

      let state;
      bp1.once('wait', () => {
        state = bp1.getState();
      });

      bp1.run();
      bp1.signal({id: 'usertask'});

      expect(bp1.counters).to.have.property('completed', 1);

      const [bp2] = context.clone().getProcesses();
      bp2.recover(state);
      bp2.resume();
      bp2.signal({id: 'usertask'});

      expect(bp2.counters).to.have.property('completed', 1);
      const receive = bp2.getActivityById('receive');
      expect(receive.counters).to.have.property('discarded', 1);
    });

    it('save state on usertask wait regardless of sequenceFlow order in source', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_155ehxd" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="Process" isExecutable="true">
          <eventBasedGateway id="decision">
            <outgoing>to-wait</outgoing>
            <outgoing>to-receive</outgoing>
          </eventBasedGateway>
          <receiveTask id="receive">
            <incoming>to-receive</incoming>
          </receiveTask>
          <userTask id="usertask">
            <incoming>to-wait</incoming>
          </userTask>
          <sequenceFlow id="to-wait" sourceRef="decision" targetRef="usertask" />
          <sequenceFlow id="to-receive" sourceRef="decision" targetRef="receive" />
        </process>
      </definitions>`;

      const context = await testHelpers.context(source);
      const [bp1] = context.getProcesses();

      let state;
      bp1.once('wait', () => {
        state = bp1.getState();
      });

      bp1.run();
      bp1.signal({id: 'usertask'});

      expect(bp1.counters).to.have.property('completed', 1);

      const [bp2] = context.clone().getProcesses();

      bp2.recover(state);
      bp2.resume();
      bp2.signal({id: 'usertask'});

      expect(bp2.counters).to.have.property('completed', 1);
      const receive = bp2.getActivityById('receive');
      expect(receive.counters).to.have.property('discarded', 1);
    });
  });
});
