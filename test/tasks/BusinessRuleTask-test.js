import testHelpers from '../helpers/testHelpers';

describe('BusinessRuleTask', () => {
  it('behaves like service task', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <businessRuleTask id="task" name="Rule" implementation="\${environment.services.rule}" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.addService('rule', (...args) => {
      args.pop()(null, true);
    });

    const task = context.getActivityById('task');

    task.activate();

    const leave = task.waitFor('leave');

    task.run();

    const api = await leave;

    expect(api.content.output).to.eql([true]);
  });
});
