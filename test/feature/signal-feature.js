import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

const signalsSource = factory.resource('signals.bpmn');

Feature('Signals', () => {
  Scenario('Two processes that communicates with signals', () => {
    let definition;
    Given('a trade process waiting for spot price update signal and another admin processs that updates price', async () => {
      definition = await prepareSource();
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let tradeTask, spotPriceChanged;
    Then('trader is considering to trade', async () => {
      [spotPriceChanged, tradeTask] = definition.getPostponed();
      expect(tradeTask).to.be.ok;
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(100);
    });

    And('spot price is monitored by process', async () => {
      expect(spotPriceChanged).to.be.ok;
    });

    let approveNewPriceTask;
    Given('spot price is updated', async () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      const signal = definition.getActivityById('spotPriceUpdate');
      definition.signal(signal.resolve());

      approveNewPriceTask = await wait;
    });

    When('admin approves new spot price', () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      approveNewPriceTask.signal({
        form: {
          newPrice: 99
        }
      });

      return wait;
    });

    Then('trade task is discarded', async () => {
      [tradeTask, spotPriceChanged] = definition.getPostponed();
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('update price is taken', async () => {
      expect(spotPriceChanged.owner.counters).to.have.property('taken', 1);
    });

    And('trader is presented new price', () => {
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(99);
    });

    When('trader trades', () => {
      tradeTask.signal({form: {amount: 42}});
    });

    And('trade task is taken', () => {
      expect(tradeTask.owner.counters).to.have.property('taken', 1);
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('run is completed', async () => {
      return end;
    });
  });

  Scenario('Resume processes that communicates with signals', () => {
    let definition;
    Given('a trade process waiting for spot price update signal and another admin processs that updates price', async () => {
      definition = await prepareSource();
    });

    When('definition is ran', () => {
      definition.run();
    });

    let tradeTask, spotPriceChanged;
    Then('trader is considering to trade', async () => {
      [spotPriceChanged, tradeTask] = definition.getPostponed();
      expect(tradeTask).to.be.ok;
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(100);
    });

    let approveNewPriceTask;
    Given('spot price is updated', async () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      const signal = definition.getActivityById('spotPriceUpdate');
      definition.signal(signal.resolve());

      approveNewPriceTask = await wait;
    });

    When('admin approves new spot price', () => {
      const wait = definition.waitFor('activity.wait', (_, api) => {
        return api.content.type === 'bpmn:UserTask';
      });

      approveNewPriceTask.signal({
        form: {
          newPrice: 101
        }
      });

      return wait;
    });

    Then('trade task is discarded', async () => {
      [tradeTask, spotPriceChanged] = definition.getPostponed();
      expect(tradeTask.owner.counters).to.have.property('discarded', 1);
    });

    And('update price is taken', async () => {
      expect(spotPriceChanged.owner.counters).to.have.property('taken', 1);
    });

    Given('trade is stopped', () => {
      definition.stop();
    });

    let end;
    When('resumed', () => {
      end = definition.waitFor('end');
      definition.resume();
    });

    Then('trader is presented new price', () => {
      const postponed = definition.getPostponed();
      expect(postponed).to.have.length(2);

      [tradeTask, spotPriceChanged] = postponed;

      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(101);
    });

    When('trader trades', () => {
      tradeTask.signal({amount: 42});
    });

    And('run is completed', async () => {
      return end;
    });
  });

  Scenario('anonymous signal', () => {
    let definition;
    Given('anonymous signal process, anonymous signal catch start process, anonymous escalation process', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="escalateProcess" isExecutable="true">
          <intermediateThrowEvent id="escalate">
            <signalEventDefinition />
          </intermediateThrowEvent>
        </process>
        <process id="managerProcess">
          <startEvent id="wakeManager">
            <signalEventDefinition />
          </startEvent>
        </process>
        <process id="bossProcess">
          <startEvent id="wakeBoss">
            <signalEventDefinition signalRef="BossSignal" />
          </startEvent>
        </process>
        <process id="escalationProcess">
          <startEvent id="startWithAnonymousSignal">
            <escalationEventDefinition />
          </startEvent>
        </process>
        <escalation id="BossSignal" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let escalateProcess, managerProcess, bossProcess, escalationProcess;
    Then('run completes', async () => {
      await end;
      [escalateProcess, managerProcess, bossProcess, escalationProcess] = definition.getProcesses();
    });

    And('escalate process completed', () => {
      expect(escalateProcess.counters).to.have.property('completed', 1);
    });

    And('manger process completed', () => {
      expect(managerProcess.counters).to.have.property('completed', 1);
    });

    And('the boss is not bothered', () => {
      expect(bossProcess.counters).to.have.property('completed', 0);
    });

    And('the escalation process is not touched', () => {
      expect(escalationProcess.counters).to.have.property('completed', 0);
    });
  });
});

async function prepareSource() {
  const context = await testHelpers.context(signalsSource, {
    extensions: {
      camunda: {
        moddleOptions: require('camunda-bpmn-moddle/resources/camunda'),
      }
    }
  });
  const definition = Definition(context, {
    variables: {
      spotPrice: 100
    },
    services: {
      getSpotPrice,
    },
    extensions: {
      camunda(activity) {
        if (activity.behaviour.extensionElements) {
          for (const extension of activity.behaviour.extensionElements.values) {
            switch (extension.$type) {
              case 'camunda:FormData':
                formFormatting(activity, extension);
                break;
              case 'camunda:InputOutput':
                ioFormatting(activity, extension);
                break;
            }
          }
        }
        if (activity.behaviour.expression) {
          activity.behaviour.Service = ServiceExpression;
        }
        if (activity.behaviour.resultVariable) {
          activity.on('end', (api) => {
            activity.environment.output[activity.behaviour.resultVariable] = api.content.output;
          });
        }
      },
    }
  });

  function formFormatting(activity, formData) {
    const {broker, environment} = activity;
    broker.subscribeTmp('event', 'activity.enter', (_, message) => {
      const form = {
        fields: {}
      };
      formData.fields.forEach((field) => {
        form.fields[field.id] = {...field};
        form.fields[field.id].defaultValue = environment.resolveExpression(form.fields[field.id].defaultValue, message);
      });
      broker.publish('format', 'run.form', { form });
    }, {noAck: true});
  }

  function ioFormatting(activity, ioData) {
    const {broker, environment} = activity;
    if (ioData.inputParameters) {
      broker.subscribeTmp('event', 'activity.enter', (_, message) => {
        const input = ioData.inputParameters.reduce((result, data) => {
          result[data.name] = environment.resolveExpression(data.value, message);
          return result;
        }, {});
        broker.publish('format', 'run.input', { input });
      }, {noAck: true});
    }
    if (ioData.outputParameters) {
      broker.subscribeTmp('event', 'activity.end', (_, message) => {
        ioData.outputParameters.forEach((data) => {
          definition.environment.variables[data.name] = environment.output[data.name] = environment.resolveExpression(data.value, message);
        });
      }, {noAck: true});
    }
  }

  function getSpotPrice(ctx, callback) {
    const price = definition.environment.variables.spotPrice;
    return callback(null, price);
  }

  function ServiceExpression(activity) {
    const {type: atype, behaviour, environment} = activity;
    const expression = behaviour.expression;
    const type = `${atype}:expression`;
    return {
      type,
      expression,
      execute,
    };
    function execute(executionMessage, callback) {
      const serviceFn = environment.resolveExpression(expression, executionMessage);
      serviceFn.call(activity, executionMessage, (err, result) => {
        callback(err, result);
      });
    }
  }

  return definition;
}
