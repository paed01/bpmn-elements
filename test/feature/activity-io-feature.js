import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

Feature('Activity IO', () => {
  Scenario('Activity with property that references input DataObject', () => {
    let definition, taskMessage;
    Given('a process with an activity with property', async () => {
      const source = factory.resource('engine-issue-139.bpmn');
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            DataObject_14zge3i: 1,
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.start', (_, msg) => {
        if (msg.content.id === 'Activity_0ksziuo') taskMessage = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('activity got property with value from DataObject', () => {
      expect(taskMessage.content.properties).to.have.property('Property_0qusu4o').with.property('value', 1);
    });
  });

  Scenario('Activity with properties that references output DataObject by association', () => {
    let definition, taskMessage;
    Given('a process with an activity with property', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="io-def" targetNamespace="http://activiti.org/bpmn">
        <process id="Process_1" isExecutable="true">
           <startEvent id="start" />
           <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
           <task id="task">
              <property id="prop_1" />
              <dataInputAssociation id="association_1">
                 <sourceRef>DataObjectReference_1</sourceRef>
                 <targetRef>prop_1</targetRef>
              </dataInputAssociation>
              <dataOutputAssociation id="association_2">
                 <sourceRef>prop_1</sourceRef>
                 <targetRef>DataObjectReference_2</targetRef>
              </dataOutputAssociation>
              <property id="prop_2" />
              <dataInputAssociation id="association_3">
                 <sourceRef>DataObjectReference_1</sourceRef>
                 <targetRef>prop_2</targetRef>
              </dataInputAssociation>
              <dataOutputAssociation id="association_4">
                 <sourceRef>prop_2</sourceRef>
                 <targetRef>DataObjectReference_3</targetRef>
              </dataOutputAssociation>
           </task>
           <dataObject id="DataObject_1" />
           <dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1" />
           <dataObject id="DataObject_2" />
           <dataObjectReference id="DataObjectReference_2" dataObjectRef="DataObject_2" />
           <dataObject id="DataObject_3" />
           <dataObjectReference id="DataObjectReference_3" dataObjectRef="DataObject_3" />
         </process>
       </definitions>
      `;
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            DataObject_1: 1,
            DataObject_2: 0,
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        if (msg.content.id === 'task') taskMessage = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('activity got property with value', () => {
      expect(taskMessage.content.properties, 'prop_1').to.have.property('prop_1').with.property('value', 1);
      expect(taskMessage.content.properties, 'prop_2').to.have.property('prop_2').with.property('value', 1);
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('DataObject_2', 1);
      expect(environmentData).to.have.property('DataObject_3', 1);
    });
  });

  Scenario('Activity with properties that references output DataObject by directly', () => {
    let definition, taskMessage;
    Given('a process with an activity with property', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="io-def" targetNamespace="http://activiti.org/bpmn">
        <process id="Process_1" isExecutable="true">
           <startEvent id="start" />
           <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
           <task id="task">
              <property id="prop_1" />
              <dataInputAssociation id="association_1">
                 <sourceRef>DataObject_1</sourceRef>
                 <targetRef>prop_1</targetRef>
              </dataInputAssociation>
              <dataOutputAssociation id="association_2">
                 <sourceRef>prop_1</sourceRef>
                 <targetRef>DataObject_2</targetRef>
              </dataOutputAssociation>
              <property id="prop_2" />
              <dataInputAssociation id="association_3">
                 <sourceRef>DataObject_1</sourceRef>
                 <targetRef>prop_2</targetRef>
              </dataInputAssociation>
              <dataOutputAssociation id="association_4">
                 <sourceRef>prop_2</sourceRef>
                 <targetRef>DataObject_3</targetRef>
              </dataOutputAssociation>
           </task>
           <dataObject id="DataObject_1" />
           <dataObject id="DataObject_2" />
           <dataObject id="DataObject_3" />
         </process>
       </definitions>
      `;
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            DataObject_1: 1,
            DataObject_2: 0,
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.end', (_, msg) => {
        if (msg.content.id === 'task') taskMessage = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('run completes', () => {
      return end;
    });

    And('activity got property with value', () => {
      expect(taskMessage.content.properties, 'prop_1').to.have.property('prop_1').with.property('value', 1);
      expect(taskMessage.content.properties, 'prop_2').to.have.property('prop_2').with.property('value', 1);
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('DataObject_2', 1);
      expect(environmentData).to.have.property('DataObject_3', 1);
    });
  });

  Scenario('Activity with IO specification and properties', () => {
    let definition, taskMessage;
    Given('a user task with properties and IO specification', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="io-def" targetNamespace="http://activiti.org/bpmn">
        <process id="Process_1" isExecutable="true">
           <startEvent id="start" />
           <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
           <userTask id="task">
              <property id="prop_1" />
              <property id="prop_2" />
              <ioSpecification id="inputSpec">
                <dataInput id="userInput" name="input" />
                <dataInput id="userInfo" name="info" />
                <dataOutput id="userOutput" name="input" />
              </ioSpecification>
              <dataInputAssociation id="dia_1" sourceRef="DataObjectReference_1" targetRef="userInput" />
              <dataInputAssociation id="dia_2" sourceRef="DataObjectReference_2" targetRef="userInfo" />
              <dataOutputAssociation id="doa_2" sourceRef="userOutput" targetRef="DataObjectReference_3" />
              <dataInputAssociation id="association_1">
                 <sourceRef>DataObjectReference_1</sourceRef>
                 <targetRef>prop_1</targetRef>
              </dataInputAssociation>
              <dataInputAssociation id="association_3">
                 <sourceRef>DataObjectReference_2</sourceRef>
                 <targetRef>prop_2</targetRef>
              </dataInputAssociation>
           </userTask>
           <dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1" />
           <dataObjectReference id="DataObjectReference_2" dataObjectRef="DataObject_2" />
           <dataObjectReference id="DataObjectReference_3" dataObjectRef="DataObject_3" />
           <dataObject id="DataObject_1" />
           <dataObject id="DataObject_2" />
           <dataObject id="DataObject_3" />
         </process>
       </definitions>
      `;
      const context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            DataObject_1: 1,
            DataObject_2: 2,
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        if (msg.content.id === 'task') taskMessage = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('task has properties', () => {
      expect(taskMessage.content.properties, 'prop_1').to.have.property('prop_1').with.property('value', 1);
      expect(taskMessage.content.properties, 'prop_2').to.have.property('prop_2').with.property('value', 2);
    });

    And('io specification', () => {
      expect(taskMessage.content).to.deep.include({
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
            value: 2,
          }],
          dataOutputs: [{
            id: 'userOutput',
            type: 'bpmn:DataOutput',
            name: 'input',
          }],
        },
      });
    });

    When('user task is signaled', () => {
      definition.getApi(taskMessage).signal({
        ioSpecification: {
          dataOutputs: [{
            id: 'userOutput',
            value: 3,
          }],
        },
      });
    });

    Then('run completes', () => {
      return end;
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('DataObject_1', 1);
      expect(environmentData).to.have.property('DataObject_2', 2);
      expect(environmentData).to.have.property('DataObject_3', 3);
    });
  });

  Scenario('Activity with property with data store reference only', () => {
    let context, definition, taskMessage1, taskMessage2;
    Given('a process with user task and a sub sequenct task, both with properties referencing data store', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="io-def" targetNamespace="http://activiti.org/bpmn">
        <process id="Process_15ozyjy" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-task-1" sourceRef="start" targetRef="task1" />
          <userTask id="task1">
            <property id="ds-prop-1" name="__targetRef_placeholder" />
            <dataInputAssociation id="DataInputAssociation_1">
              <sourceRef>DataStoreReference_1</sourceRef>
              <targetRef>ds-prop-1</targetRef>
            </dataInputAssociation>
            <dataOutputAssociation id="DataOutputAssociation_1">
              <sourceRef>ds-prop-1</sourceRef>
              <targetRef>DataStoreReference_1</targetRef>
            </dataOutputAssociation>
          </userTask>
          <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
          <task id="task2">
            <property id="ds-prop-2" name="__targetRef_placeholder" />
            <dataInputAssociation id="DataInputAssociation_2">
              <sourceRef>DataStoreReference_1</sourceRef>
              <targetRef>ds-prop-2</targetRef>
            </dataInputAssociation>
          </task>
          <dataStoreReference id="DataStoreReference_1" />
        </process>
       </definitions>
      `;
      context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            DataStoreReference_1: {
              value: 1
            },
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        if (msg.content.id === 'task1') taskMessage1 = msg;
        if (msg.content.id === 'task2') taskMessage2 = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('user task has properties', () => {
      expect(taskMessage1.content.properties, 'ds-prop-1').to.have.property('ds-prop-1').with.property('value').that.deep.equal({value: 1});
    });

    let state;
    When('state is saved and user task is signaled', () => {
      state = definition.getState();
      definition.getApi(taskMessage1).signal({
        properties: {
          'ds-prop-1': {
            value: {value: 3},
          },
        },
      });
    });

    Then('run completes', () => {
      return end;
    });

    And('property value was set on second task', () => {
      expect(taskMessage2.content.properties, 'ds-prop-2').to.have.property('ds-prop-2').with.property('value').that.deep.equal({value: 3});
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('DataStoreReference_1').that.deep.equal({value: 3});
    });

    Given('data has been updated', () => {
      state.environment.variables._data.DataStoreReference_1 = {
        value: 4,
      };
    });

    let resumedTaskMessage1;
    When('resumed from user task and data has been updated', () => {

      definition = new Definition(context.clone()).recover(state);
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        if (msg.content.id === 'task1') resumedTaskMessage1 = msg;
        if (msg.content.id === 'task2') taskMessage2 = msg;
      }, {noAck: true});

      definition.resume();
    });

    Then('user task has properties from state', () => {
      expect(resumedTaskMessage1.content.properties, 'ds-prop-1').to.have.property('ds-prop-1').with.property('value').that.deep.equal({value: 1});
    });

    When('recovered user task is signaled', () => {
      definition.getApi(resumedTaskMessage1).signal({
        properties: {
          'ds-prop-1': {
            value: {value: 5},
          },
        },
      });
    });

    Then('run completes', () => {
      return end;
    });

    And('property value was set on second task', () => {
      expect(taskMessage2.content.properties, 'ds-prop-2').to.have.property('ds-prop-2').with.property('value').that.deep.equal({value: 5});
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('DataStoreReference_1').that.deep.equal({value: 5});
    });
  });

  Scenario('Activity with property referencing data store ', () => {
    let context, definition, taskMessage1, taskMessage2;
    Given('a process with user task and a sub sequenct task, both with properties referencing data store', async () => {
      const source = `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        id="io-def" targetNamespace="http://activiti.org/bpmn">
        <process id="Process_15ozyjy" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-task-1" sourceRef="start" targetRef="task1" />
          <userTask id="task1">
            <property id="ds-prop-1" name="__targetRef_placeholder" />
            <dataInputAssociation id="DataInputAssociation_1">
              <sourceRef>DataStoreReference_1</sourceRef>
              <targetRef>ds-prop-1</targetRef>
            </dataInputAssociation>
            <dataOutputAssociation id="DataOutputAssociation_1">
              <sourceRef>ds-prop-1</sourceRef>
              <targetRef>DataStoreReference_1</targetRef>
            </dataOutputAssociation>
          </userTask>
          <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
          <task id="task2">
            <property id="ds-prop-2" name="__targetRef_placeholder" />
            <dataInputAssociation id="DataInputAssociation_2">
              <sourceRef>DataStoreReference_1</sourceRef>
              <targetRef>ds-prop-2</targetRef>
            </dataInputAssociation>
          </task>
          <sequenceFlow id="to-task3" sourceRef="task2" targetRef="task3" />
          <task id="task3">
            <property id="ds-prop-3" name="__targetRef_placeholder" />
            <dataOutputAssociation id="DataOutputAssociation_2">
              <sourceRef>ds-prop-3</sourceRef>
              <targetRef>DataStoreReference_2</targetRef>
            </dataOutputAssociation>
          </task>
          <dataStoreReference id="DataStoreReference_1" dataStoreRef="datastore" />
          <dataStoreReference id="DataStoreReference_2" dataStoreRef="empty" />
        </process>
        <dataStore id="datastore" />
        <dataStore id="empty" />
       </definitions>
      `;
      context = await testHelpers.context(source);
      definition = new Definition(context, {
        variables: {
          _data: {
            datastore: {
              value: 1
            },
          }
        }
      });
    });

    let end;
    When('ran', () => {
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        if (msg.content.id === 'task1') taskMessage1 = msg;
        if (msg.content.id === 'task2') taskMessage2 = msg;
      }, {noAck: true});

      definition.run();
    });

    Then('user task has properties', () => {
      expect(taskMessage1.content.properties, 'ds-prop-1').to.have.property('ds-prop-1').with.property('value').that.deep.equal({value: 1});
    });

    let state;
    When('state is saved and user task is signaled', () => {
      state = definition.getState();
      definition.getApi(taskMessage1).signal({
        properties: {
          'ds-prop-1': {
            value: {value: 3},
          },
        },
      });
    });

    Then('run completes', () => {
      return end;
    });

    And('property value was set on second task', () => {
      expect(taskMessage2.content.properties, 'ds-prop-2').to.have.property('ds-prop-2').with.property('value').that.deep.equal({value: 3});
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('datastore').that.deep.equal({value: 3});
    });

    Given('data has been updated', () => {
      state.environment.variables._data.datastore = {
        value: 4,
      };
    });

    let resumedTaskMessage1;
    When('resumed from user task and data has been updated', () => {

      definition = new Definition(context.clone()).recover(state);
      end = definition.waitFor('end');

      definition.broker.subscribeTmp('event', 'activity.#', (_, msg) => {
        if (msg.content.id === 'task1') resumedTaskMessage1 = msg;
        if (msg.content.id === 'task2') taskMessage2 = msg;
      }, {noAck: true});

      definition.resume();
    });

    Then('user task has properties from state', () => {
      expect(resumedTaskMessage1.content.properties, 'ds-prop-1').to.have.property('ds-prop-1').with.property('value').that.deep.equal({value: 1});
    });

    When('recovered user task is signaled', () => {
      definition.getApi(resumedTaskMessage1).signal({
        properties: {
          'ds-prop-1': {
            value: {value: 5},
          },
        },
      });
    });

    Then('run completes', () => {
      return end;
    });

    And('property value was set on second task', () => {
      expect(taskMessage2.content.properties, 'ds-prop-2').to.have.property('ds-prop-2').with.property('value').that.deep.equal({value: 5});
    });

    And('data has been updated', () => {
      const environmentData = definition.environment.variables._data;
      expect(environmentData).to.have.property('datastore').that.deep.equal({value: 5});
    });
  });
});
