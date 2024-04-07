import testHelpers from '../helpers/testHelpers.js';

describe('ManualTask', () => {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="start" />
      <manualTask id="task" />
      <endEvent id="end" />
      <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
    </process>
  </definitions>`;

  let context;
  beforeEach(async () => {
    context = await testHelpers.context(source);
  });

  it('keeps execute wait state until signaled', async () => {
    const task = context.getActivityById('task');

    const waiting = task.waitFor('wait');
    const left = task.waitFor('leave');
    task.run();

    const waitApi = await waiting;

    expect(task.broker.getQueue('run-q').messageCount, 'run queue').to.equal(1);
    expect(task.broker.getQueue('execute-q').messageCount, 'execute queue').to.equal(1);

    waitApi.signal();

    await left;

    expect(task.broker.getQueue('run-q').messageCount, 'run queue').to.equal(0);
    expect(task.broker.getQueue('execute-q').messageCount, 'execute queue').to.equal(0);
  });

  it('sets output and completes when signaled', async () => {
    const task = context.getActivityById('task');

    const waiting = task.waitFor('wait');
    const leave = task.waitFor('leave');
    task.activate();
    task.run();

    const taskApi = await waiting;
    taskApi.signal({ data: 1 });

    const api = await leave;

    expect(api.content.output).to.eql({ data: 1 });
  });
});
