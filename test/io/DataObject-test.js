import { DataObject } from 'bpmn-elements';
import { ActivityBroker } from '../../src/EventBroker.js';
import testHelpers from '../helpers/testHelpers.js';

describe('DataObject', () => {
  describe('read', () => {
    it('publishes message on passed broker exchange when value was read', () => {
      const { broker } = ActivityBroker();
      const dataObject = new DataObject({ id: 'input' }, testHelpers.emptyContext());

      /** @type {import('bpmn-elements').ElementBrokerMessage} */
      let message;
      broker.subscribeOnce('format', 'test.#', (_, msg) => {
        message = msg;
      });

      dataObject.read(broker, 'format', 'test.');

      expect(message).to.be.ok;
      expect(message.content).to.have.property('id', 'input');
    });
  });

  describe('write', () => {
    it('publishes message on passed broker exchange when value was written', () => {
      const { broker } = ActivityBroker();
      const dataObject = new DataObject({ id: 'input' }, testHelpers.emptyContext());

      /** @type {import('bpmn-elements').ElementBrokerMessage} */
      let message;
      broker.subscribeOnce('format', 'test.#', (_, msg) => {
        message = msg;
      });

      dataObject.write(broker, 'format', 'test.');

      expect(message).to.be.ok;
      expect(message.content).to.have.property('id', 'input');
    });
  });

  describe('builtin', () => {
    it('saves dataObject value in environment variables _data', () => {
      const context = testHelpers.emptyContext();
      const environment = context.environment;
      const { broker } = ActivityBroker();
      const dataObject = new DataObject({ id: 'info' }, context);

      dataObject.write(broker, 'format', 'test', 'me');

      expect(environment.variables._data).to.have.property('info', 'me');
    });
  });
});
