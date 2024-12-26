import testHelpers from '../helpers/testHelpers.js';

describe('CallActivity', () => {
  const source = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions id="Def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="caller" isExecutable="true">
      <callActivity id="task" />
    </process>
  </definitions>`;

  let context;
  beforeEach(async () => {
    context = await testHelpers.context(source);
  });

  it('ignores delegate message without message', () => {
    const task = context.getActivityById('task');

    task.run();

    task.broker.publish('api', 'definition.signal.Def_1', {}, { delegate: true });

    expect(task.status).to.equal('executing');
  });

  it('ignores non-delegated api message', () => {
    const task = context.getActivityById('task');

    task.run();

    task.broker.publish('api', 'definition.signal.Def_1', { message: { id: 'task' } }, { type: 'cancel', delegate: false });

    expect(task.status).to.equal('executing');
  });
});
