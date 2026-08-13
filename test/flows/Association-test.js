import { Environment } from 'bpmn-elements';
import { Association } from 'bpmn-elements/flows';
import { ActivityBroker } from '../../src/EventBroker.js';

describe('Association', () => {
  it('stop() stops broker', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };

    const flow = new Association(
      /** @type {any} */ ({
        id: 'association',
        type: 'bpmn:Association',
        parent: {},
        source: {
          id: 'task',
        },
        target: {
          id: 'task1',
        },
      }),
      /** @type {any} */ (context)
    );

    expect(flow.broker.getExchange('event').stopped).to.be.false;
    flow.stop();
    expect(flow.broker.getExchange('event').stopped).to.be.true;
  });

  it('getApi() returns message Api', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };

    const flow = new Association(
      /** @type {any} */ ({
        id: 'association',
        type: 'bpmn:Association',
        parent: {},
        source: {
          id: 'task',
        },
        target: {
          id: 'task1',
        },
      }),
      /** @type {any} */ (context)
    );

    const api = flow.getApi();
    expect(api).to.have.property('id', 'association');
  });

  it('getApi(message) returns message Api', () => {
    const activity = ActivityBroker();
    const context = {
      environment: new Environment(),
      getActivityById() {
        return activity;
      },
    };

    const flow = new Association(
      /** @type {any} */ ({
        id: 'association',
        type: 'bpmn:Association',
        parent: {},
        source: {
          id: 'task',
        },
        target: {
          id: 'task1',
        },
      }),
      /** @type {any} */ (context)
    );

    const api = flow.getApi(/** @type {any} */ ({ content: { id: 'foo' } }));
    expect(api).to.have.property('id', 'foo');
  });
});
