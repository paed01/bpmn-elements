import InputOutputSpecification from '../../src/io/InputOutputSpecification.js';
import testHelpers from '../helpers/testHelpers.js';
import {ActivityBroker} from '../../src/EventBroker.js';

describe('InputOutputSpecification', () => {
  it('listens on parent activity when activated', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {}).activate();
    expect(activity.broker.consumerCount).to.equal(1);
  });

  it('listens only once when activated', () => {
    const activity = ActivityBroker();
    const ioSpec = new InputOutputSpecification(activity, {});
    ioSpec.activate();
    ioSpec.activate();
    expect(activity.broker.consumerCount).to.equal(1);
  });

  it('removes listener when deactivated', () => {
    const activity = ActivityBroker();
    const ioSpec = new InputOutputSpecification(activity, {});
    ioSpec.activate();
    ioSpec.deactivate();
    ioSpec.deactivate();
    expect(activity.broker.consumerCount).to.equal(0);
  });

  it('sends format start message on activity enter', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataInputs: [],
      },
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    expect(activity.broker.getQueue('format-run-q').messageCount).to.equal(1);
    expect(activity.broker.getQueue('format-run-q').peek().fields.routingKey).to.equal('run.onstart.bpmn_inputoutputspecification');
  });

  it('doesn\'t send start message if no dataInputs', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    expect(activity.broker.getQueue('format-run-q').messageCount).to.equal(0);
  });

  it('sends format start message with input on activity start', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataInputs: [],
      },
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    const formatMsg = activity.broker.getQueue('format-run-q').peek();

    expect(formatMsg.content).to.have.property('ioSpecification');
  });

  it('fetches input data object value', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataInputs: [{
          id: 'userInput',
          type: 'iospecdatainput',
          name: 'Input from user',
          behaviour: {
            association: {
              source: {
                dataObject: {
                  id: 'dataInput',
                },
              },
            },
          },
        }],
      },
    }, {
      getDataObjectById(id) {
        if (id !== 'dataInput') return;
        return {
          id: 'dataInput',
          read(broker, exchange, routingKeyPrefix) {
            return broker.publish(exchange, `${routingKeyPrefix}result`, {id: 'dataInput', value: 'global data'});
          },
        };
      },
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    const formatStartMsg = activity.broker.getQueue('format-run-q').get();
    expect(formatStartMsg).to.have.property('fields').with.property('routingKey', 'run.onstart.bpmn_inputoutputspecification.begin');

    expect(formatStartMsg.content).to.have.property('endRoutingKey', 'run.onstart.bpmn_inputoutputspecification.end');
    expect(formatStartMsg.content).to.have.property('ioSpecification');
    expect(formatStartMsg.content.ioSpecification).to.have.property('dataInputs').that.eql([{
      id: 'userInput',
      type: 'iospecdatainput',
      name: 'Input from user',
    }]);

    formatStartMsg.ack();

    const formatEndMsg = activity.broker.getQueue('format-run-q').get();
    expect(formatEndMsg).to.have.property('fields').with.property('routingKey', 'run.onstart.bpmn_inputoutputspecification.end');

    expect(formatEndMsg.content).to.not.have.property('endRoutingKey');
    expect(formatEndMsg.content).to.have.property('ioSpecification');
    expect(formatEndMsg.content.ioSpecification).to.have.property('dataInputs').that.eql([{
      id: 'userInput',
      type: 'iospecdatainput',
      name: 'Input from user',
      value: 'global data',
    }]);

    formatEndMsg.ack();
  });

  it('publishes input without data object value if not found', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataInputs: [{
          id: 'userInput',
          type: 'iospecdatainput',
          name: 'Input from user',
          behaviour: {
            association: {
              source: {
                dataObject: {
                  id: 'myInput',
                },
              },
            },
          },
        }],
      },
    }, {
      getDataObjectById() {},
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    const formatMsg = activity.broker.getQueue('format-run-q').peek();

    expect(formatMsg.content).to.have.property('ioSpecification');
    expect(formatMsg.content.ioSpecification).to.have.property('dataInputs').that.eql([{
      id: 'userInput',
      type: 'iospecdatainput',
      name: 'Input from user',
    }]);
  });

  it('publishes input without data object if unreferenced', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataInputs: [{
          id: 'userInput',
          type: 'iospecdatainput',
          name: 'Input from user',
          behaviour: {},
        }],
      },
    }, {
      getDataObjectById() {},
    }).activate();

    activity.broker.publish('event', 'activity.enter');

    const formatMsg = activity.broker.getQueue('format-run-q').peek();

    expect(formatMsg.content).to.have.property('ioSpecification');
    expect(formatMsg.content.ioSpecification).to.have.property('dataInputs').that.eql([{
      id: 'userInput',
      type: 'iospecdatainput',
      name: 'Input from user',
    }]);
  });

  it('publishes output without value if data object if unreferenced', () => {
    const activity = ActivityBroker();
    new InputOutputSpecification(activity, {
      type: 'bpmn:InputOutputSpecification',
      behaviour: {
        dataOutputs: [{
          id: 'userOutput',
          type: 'iospecdataoutput',
          name: 'Output from user',
          behaviour: {
            association: {
              target: {
                dataObject: {
                  id: 'missing',
                },
              },
            },
          },
        }],
      },
    }, {
      getDataObjectById() {},
    }).activate();

    activity.broker.publish('event', 'activity.execution.completed');

    const formatMsg = activity.broker.getQueue('format-run-q').peek();

    expect(formatMsg.content).to.have.property('ioSpecification');
    expect(formatMsg.content.ioSpecification).to.have.property('dataOutputs').that.deep.equal([{
      id: 'userOutput',
      type: 'iospecdataoutput',
      name: 'Output from user',
      value: undefined,
    }]);
  });

  it('formats message before run execute and after run complete', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="dor_1" dataObjectRef="inputData" />
        <dataObjectReference id="dor_2" dataObjectRef="infoData" />
        <dataObject id="inputData" />
        <dataObject id="infoData" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="userInput" name="input">user info</dataInput>
            <dataInput id="userInfo" name="info">user info</dataInput>
            <dataOutput id="userOutput" name="input" />
          </ioSpecification>
          <dataInputAssociation id="dia_1" sourceRef="dor_1" targetRef="userInput" />
          <dataInputAssociation id="dia_2" sourceRef="dor_2" targetRef="userInfo" />
          <dataOutputAssociation id="doa_2" sourceRef="userOutput" targetRef="dor_1" />
        </userTask>
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.variables._data = {
      inputData: 1,
      infoData: 'we value your input',
    };

    const activity = context.getActivityById('userTask');

    const start = activity.waitFor('start');
    const wait = activity.waitFor('wait');
    const end = activity.waitFor('end');

    activity.run();

    let api = await start;

    expect(api.content).to.deep.include({
      ioSpecification: {
        dataInputs: [{
          id: 'userInput',
          type: 'bpmn:DataInput',
          name: 'input',
          value: 1,
        }, {
          id: 'userInfo',
          type: 'bpmn:DataInput',
          name: 'info',
          value: 'we value your input',
        }],
        dataOutputs: [{
          id: 'userOutput',
          type: 'bpmn:DataOutput',
          name: 'input',
        }],
      },
    });

    api = await wait;

    api.signal({
      ioSpecification: {
        dataOutputs: [{
          id: 'userOutput',
          value: 2,
        }],
      },
    });

    api = await end;

    expect(api.content.output).to.deep.include({
      ioSpecification: {
        dataOutputs: [{
          id: 'userOutput',
          value: 2,
        }],
      },
    });

    expect(context.environment.variables._data).to.have.property('inputData', 2);
  });

  it('sets named input when ran', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="userInput" name="input" />
          </ioSpecification>
        </userTask>
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    const task = context.getActivityById('userTask');

    const start = task.waitFor('start');

    task.run();

    const api = await start;

    expect(api.content).to.have.property('ioSpecification');
  });

  it('dataInput formats activity start run message', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputToUserRef" dataObjectRef="userInfo" />
        <dataObject id="userInfo" />
        <startEvent id="theStart" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="userInput" name="info" />
          </ioSpecification>
          <dataInputAssociation id="associatedWith" sourceRef="userInput" targetRef="inputToUserRef" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
        <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.variables.userInfo = 'this is how';

    const task = context.getActivityById('userTask');

    const wait = task.waitFor('wait');
    const leave = task.waitFor('leave');

    task.run();

    const api = await wait;

    expect(api.content.ioSpecification).to.have.property('dataInputs').with.length(1);
    expect(api.content.ioSpecification.dataInputs[0]).that.eql({ id: 'userInput', type: 'bpmn:DataInput', name: 'info' });

    api.signal('no input');

    await leave;

    expect(context.environment.output).to.eql({});
  });

  it('dataOutput formats activity start run message', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputFromUserRef" dataObjectRef="inputFromUser" />
        <dataObject id="inputFromUser" />
        <startEvent id="theStart" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataOutput id="userInput" name="sirname" />
          </ioSpecification>
          <dataOutputAssociation id="associatedWith" sourceRef="userInput" targetRef="inputFromUserRef" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
        <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    const task = context.getActivityById('userTask');

    const wait = task.waitFor('wait');
    const leave = task.waitFor('leave');

    task.run();

    let api = await wait;

    expect(api.content.ioSpecification).to.have.property('dataOutputs').with.length(1);
    expect(api.content.ioSpecification.dataOutputs[0]).that.eql({ id: 'userInput', type: 'bpmn:DataOutput', name: 'sirname' });

    api.signal({
      ioSpecification: {
        dataOutputs: [{
          id: 'userInput',
          value: 'von Rosen',
        }],
      },
    });

    api = await leave;

    expect(context.environment.variables._data).to.have.property('inputFromUser', 'von Rosen');
  });

  it('no data objects effectively ignores io', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="userInput" name="info" value="lkJH">user info</dataInput>
          </ioSpecification>
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
        <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.variables.userInfo = 'this is how';

    const task = context.getActivityById('userTask');

    const wait = task.waitFor('wait');
    const leave = task.waitFor('leave');

    task.run();

    const api = await wait;

    expect(api.content).to.have.property('ioSpecification');

    api.signal('no input');

    await leave;
  });

  it('dataInputAssociation without target is ignored', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <startEvent id="theStart" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="userInput" name="info" />
          </ioSpecification>
          <dataInputAssociation id="associatedWith" sourceRef="userInput" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="userTask" />
        <sequenceFlow id="flow2" sourceRef="userTask" targetRef="theEnd" />
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.variables.userInfo = 'this is how';

    const task = context.getActivityById('userTask');

    const wait = task.waitFor('wait');
    const leave = task.waitFor('leave');

    task.run();

    const api = await wait;

    api.signal('no input');

    await leave;
  });

  it('dataObjectReference without dataObjectRef returns empty input', async () => {
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="userInfoRef" />
        <dataObject id="userInfo" />
        <userTask id="userTask">
          <ioSpecification id="inputSpec">
            <dataInput id="infoToUser" name="info" />
          </ioSpecification>
          <dataInputAssociation id="associatedWith" sourceRef="infoToUser" targetRef="userInfoRef" />
        </userTask>
      </process>
    </definitions>`;

    const context = await testHelpers.context(source);
    context.environment.variables.userInfo = 'this is how';

    const task = context.getActivityById('userTask');

    const wait = task.waitFor('wait');
    const leave = task.waitFor('leave');

    task.run();

    const api = await wait;

    api.signal('no input');

    await leave;
  });

  describe('inputSet and outputSet', () => {
    let context;
    const source = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions id="testIoSpec" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="theProcess" isExecutable="true">
        <dataObjectReference id="inputRef" dataObjectRef="input" />
        <dataObjectReference id="staticRef" dataObjectRef="static" />
        <dataObjectReference id="surnameRef" dataObjectRef="surname" />
        <dataObjectReference id="givenNameRef" dataObjectRef="givenName" />
        <dataObject id="input" />
        <dataObject id="static" />
        <dataObject id="surname" />
        <dataObject id="givenName" />
        <startEvent id="theStart" />
        <userTask id="task1">
          <ioSpecification id="inputSpec1">
            <dataInput id="input_1" name="input" />
            <dataInput id="staticField" name="static" />
            <dataOutput id="surnameInput" name="surname" />
            <inputSet id="inputSet_1">
              <dataInputRefs>input_1</dataInputRefs>
              <dataInputRefs>staticField</dataInputRefs>
            </inputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput" sourceRef="inputRef" targetRef="input_1" />
          <dataInputAssociation id="associatedStatic" sourceRef="staticRef" targetRef="staticField" />
          <dataOutputAssociation id="associatedOutput" sourceRef="surnameInput" targetRef="surnameRef" />
        </userTask>
        <userTask id="task2">
          <ioSpecification id="inputSpec2">
            <dataInput id="input_2" name="age" />
            <dataInput id="input_3" name="surname" />
            <dataOutput id="givenNameField" name="givenName" />
            <dataOutput id="ageField" name="age" />
            <outputSet id="outputSet_2">
              <dataOutputRefs>givenNameField</dataOutputRefs>
              <dataOutputRefs>ageField</dataOutputRefs>
            </outputSet>
          </ioSpecification>
          <dataInputAssociation id="associatedInput_2" sourceRef="inputRef" targetRef="input_2" />
          <dataInputAssociation id="associatedInput_3" sourceRef="surnameRef" targetRef="input_3" />
          <dataOutputAssociation id="associatedOutput_2" sourceRef="givenNameField" targetRef="givenNameRef" />
          <dataOutputAssociation id="associatedOutput_3" sourceRef="ageField" targetRef="inputRef" />
        </userTask>
        <endEvent id="theEnd" />
        <sequenceFlow id="flow1" sourceRef="theStart" targetRef="task1" />
        <sequenceFlow id="flow2" sourceRef="task1" targetRef="task2" />
        <sequenceFlow id="flow3" sourceRef="task2" targetRef="theEnd" />
      </process>
    </definitions>`;

    beforeEach(async () => {
      context = await testHelpers.context(source);
    });

    it('inputSet is available to activity', async () => {
      context.environment.variables._data = {input: 'START'};

      const task = context.getActivityById('task1');

      const wait = task.waitFor('wait');

      task.run();

      const api = await wait;

      expect(api.content.ioSpecification).to.be.ok;
      expect(api.content.ioSpecification.dataInputs).to.have.length(2);
      expect(api.content.ioSpecification.dataInputs[0]).to.have.property('name', 'input');
      expect(api.content.ioSpecification.dataInputs[0]).to.have.property('value', 'START');
    });

    it('output is saved to dataobject', async () => {
      const task = context.getActivityById('task1');

      const wait = task.waitFor('wait');
      const leave = task.waitFor('leave');

      task.run();

      let api = await wait;

      api.signal({
        ioSpecification: {
          dataOutputs: [{
            id: 'surnameInput',
            value: 'von Rosen',
          }],
        },
      });

      api = await leave;

      expect(context.environment.variables._data).to.have.property('surname', 'von Rosen');
    });

    it('environment variables are set on end', async () => {
      const instance = context.getProcessById('theProcess');
      instance.environment.variables._data = {input: 42};

      const leave = instance.waitFor('leave');
      let wait = instance.waitFor('wait');

      instance.run();

      let api = await wait;
      expect(api.id).to.equal('task1');

      wait = instance.waitFor('wait');
      api.signal({
        ioSpecification: {
          dataOutputs: [{
            id: 'surnameInput',
            value: 'von Rosen',
          }],
        },
      });

      api = await wait;
      expect(api.id).to.equal('task2');

      expect(api.content.ioSpecification.dataInputs).to.have.length(2);
      expect(api.content.ioSpecification.dataInputs[0]).to.have.property('name', 'age');
      expect(api.content.ioSpecification.dataInputs[1]).to.have.property('name', 'surname');

      api.signal({
        ioSpecification: {
          dataOutputs: [{
            id: 'givenNameField',
            value: ['Martin', 'Pål'],
          }, {
            id: 'ageField',
            value: 43,
          }],
        },
      });

      await leave;

      expect(instance.environment.variables._data).to.eql({
        input: 43,
        surname: 'von Rosen',
        givenName: ['Martin', 'Pål'],
      });
    });
  });
});
