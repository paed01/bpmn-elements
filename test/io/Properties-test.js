import Environment from '../../src/Environment.js';
import Properties from '../../src/io/Properties.js';
import { ActivityBroker } from '../../src/EventBroker.js';

describe('Properties', () => {
  it('activate twice has no effect', () => {
    const { broker } = ActivityBroker();
    const props = new Properties(
      {
        id: 'input',
        broker,
        environment: new Environment(),
      },
      {
        values: [],
      }
    );
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
    const { broker } = ActivityBroker();
    const props = new Properties(
      {
        id: 'input',
        broker,
        environment: new Environment(),
      },
      {
        values: [],
      }
    );
    props.activate({
      fields: {},
      content: {},
    });
    props.deactivate();
    props.deactivate();
  });
});
