import testHelpers from '../helpers/testHelpers';

describe('Task', () => {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="start" />
      <task id="task" />
      <endEvent id="end" />
      <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
    </process>
  </definitions>`;

  let context;
  beforeEach(async () => {
    context = await testHelpers.context(source);
  });

  it('completes immediately when executed', async () => {
    const task = context.getActivityById('task');

    const left = task.waitFor('leave');
    task.run();

    await left;

    expect(task.broker.getQueue('run-q').messageCount, 'run queue').to.equal(0);
    expect(task.broker.getQueue('execute-q').messageCount, 'execute queue').to.equal(0);
  });
});
