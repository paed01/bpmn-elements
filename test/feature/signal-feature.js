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
      [tradeTask, spotPriceChanged] = definition.getPostponed();
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(101);
    });

    When('trader trades', () => {
      tradeTask.signal({amount: 42});
    });

    And('run is completed', async () => {
      return end;
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
