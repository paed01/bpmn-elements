import camunda from '../resources/extensions/CamundaExtension.js';
import Definition from '../../src/definition/Definition.js';
import factory from '../helpers/factory.js';
import testHelpers from '../helpers/testHelpers.js';

Feature('IO', () => {
  Scenario('DataStoreReference and DataInput- and DataOutputAssociation', () => {
    let definition;
    Given('two tasks associated with a data store reference only', async () => {
      const context = await testHelpers.context(factory.resource('signals.bpmn'), {
        extensions: {camunda},
      });

      definition = new Definition(context, {
        settings: {
          dataStores: new DataStores({
            SpotPriceDb: {price: 100},
          }),
        },
        services: {
          getSpotPrice(msg, callback) {
            return callback(null, this.environment.settings.dataStores.getDataStore(msg.content.db).price);
          },
        },
        extensions: {
          camunda: camunda.extension,
          datastore(activity) {
            if (activity.behaviour.dataInputAssociations) {
              activity.on('enter', () => {
                activity.broker.publish('format', 'run.enter.format', {
                  db: activity.behaviour.dataInputAssociations[0].behaviour.sourceRef.id,
                });
              });
            }

            if (activity.behaviour.dataOutputAssociations) {
              activity.on('end', (api) => {
                const db = activity.behaviour.dataOutputAssociations[0].behaviour.targetRef.id;
                activity.environment.settings.dataStores.setDataStore(db, {...api.content.output});
              });
            }
          },
        },
      });
    });

    let wait;
    When('definition is ran', () => {
      definition.run();
    });

    let tradeTask, approvePriceTask;
    Then('user task waits expects a form with data from data source', () => {
      [, tradeTask] = definition.getPostponed();
      expect(tradeTask.id).to.equal('tradeTask');
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(100);
    });

    When('second process is triggered', () => {
      const signal = definition.getActivityById('updateSpotPrice');
      definition.signal(signal.resolve());
      approvePriceTask = definition.getPostponed()[2];
      expect(approvePriceTask.id).to.equal('approveSpotPrice');
    });

    And('completes', () => {
      wait = definition.waitFor('wait');
      approvePriceTask.signal({
        form: {
          newPrice: 99,
        },
      });
    });

    Then('user task waits again with new data from data source', async () => {
      await wait;
      [tradeTask] = definition.getPostponed();
      expect(tradeTask.id).to.equal('tradeTask');
      expect(tradeTask.content.form.fields.price.defaultValue).to.equal(99);
    });
  });
});

function DataStores(data) {
  this.data = data;
}

DataStores.prototype.getDataStore = function getDataStore(id) {
  return this.data[id];
};

DataStores.prototype.setDataStore = function setDataStore(id, value) {
  this.data[id] = value;
};
