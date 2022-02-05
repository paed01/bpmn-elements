import Environment from '../../src/Environment';
import Properties from '../../src/io/Properties';
import {ActivityBroker} from '../../src/EventBroker';

describe('Properties', () => {
  it('activate twice has no effect', () => {
    const {broker} = ActivityBroker();
    const props = new Properties({
      id: 'input',
      broker,
      environment: new Environment(),
    }, {
      values: [],
    });
    props.activate({
      fields: {},
      content: {},
    });
    props.activate({
      fields: {},
      content: {},
    });
  });

  it('deactivate twice has no effect', () => {
    const {broker} = ActivityBroker();
    const props = new Properties({
      id: 'input',
      broker,
      environment: new Environment(),
    }, {
      values: [],
    });
    props.activate({
      fields: {},
      content: {},
    });
    props.deactivate();
    props.deactivate();
  });

  // describe('read', () => {
  //   it('publishes message on passed broker exchange when value was read', () => {

  //     let message;
  //     broker.subscribeOnce('format', 'test.#', (_, msg) => {
  //       message = msg;
  //     });

  //     dataObject.read(broker, 'format', 'test.');

  //     expect(message).to.be.ok;
  //     expect(message.content).to.have.property('id', 'input');
  //   });
  // });

  // describe('write', () => {
  //   it('publishes message on passed broker exchange when value was written', () => {
  //     const {broker} = ActivityBroker();
  //     const dataObject = Properties({id: 'input'}, {environment: new Environment()});

  //     let message;
  //     broker.subscribeOnce('format', 'test.#', (_, msg) => {
  //       message = msg;
  //     });

  //     dataObject.write(broker, 'format', 'test.');

  //     expect(message).to.be.ok;
  //     expect(message.content).to.have.property('id', 'input');
  //   });
  // });

  // describe('builtin', () => {
  //   it('saves dataObject value in environment variables _data', () => {
  //     const environment = new Environment();
  //     const {broker} = ActivityBroker();
  //     const dataObject = Properties({id: 'info'}, {environment});

  //     dataObject.write(broker, 'format', 'test', 'me');

  //     expect(environment.variables._data).to.have.property('info', 'me');
  //   });
  // });
});
