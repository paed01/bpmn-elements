import DataObject from '../../src/io/EnvironmentDataObject.js';
import Environment from '../../src/Environment.js';
import {ActivityBroker} from '../../src/EventBroker.js';

describe('DataObject', () => {
  describe('read', () => {
    it('publishes message on passed broker exchange when value was read', () => {
      const {broker} = ActivityBroker();
      const dataObject = new DataObject({id: 'input'}, {environment: new Environment()});

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
      const {broker} = ActivityBroker();
      const dataObject = new DataObject({id: 'input'}, {environment: new Environment()});

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
      const environment = new Environment();
      const {broker} = ActivityBroker();
      const dataObject = new DataObject({id: 'info'}, {environment});

      dataObject.write(broker, 'format', 'test', 'me');

      expect(environment.variables._data).to.have.property('info', 'me');
    });
  });
});
