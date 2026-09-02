import { Environment, Properties } from 'bpmn-elements';
import { ActivityBroker } from '../../src/EventBroker.js';

describe('Properties', () => {
  it('activate twice has no effect', () => {
    const { broker } = ActivityBroker();
    // @ts-expect-error type coverage
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
      // @ts-expect-error type coverage
      fields: {},
      content: {},
    });
    props.activate({
      // @ts-expect-error type coverage
      fields: {},
      content: {},
    });
  });

  it('deactivate twice has no effect', () => {
    const { broker } = ActivityBroker();
    // @ts-expect-error type coverage
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
      // @ts-expect-error type coverage
      fields: {},
      content: {},
    });
    props.deactivate();
    props.deactivate();
  });
});
