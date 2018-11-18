import Environment from '../../src/Environment';
import testHelpers from '../helpers/testHelpers';
import TimerEventDefinition from '../../src/eventDefinitions/TimerEventDefinition';
import {ActivityApi} from '../../src/Api';
import {ActivityBroker} from '../../src/EventBroker';

describe('TimerEventDefinition', () => {
  let event;
  beforeEach(() => {
    event = {
      id: 'event',
      type: 'bpmn:Event',
      environment: Environment({Logger: testHelpers.Logger}),
    };
    event.broker = ActivityBroker(event).broker;
  });

  it('resolves duration from event scope', () => {
    const definition = TimerEventDefinition(event, {
      type: 'bpmn:TimerEventDefinition',
      behaviour: {
        timeDuration: '${content.input.duration}',
      },
    });

    const messages = [];
    event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
      messages.push(msg);
    }, {noAck: true});


    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
        input: {
          duration: 'PT0.1S',
        },
      },
    });

    expect(messages).to.have.length(1);
    expect(messages[0].fields).to.have.property('routingKey', 'activity.timer');
    expect(messages[0].content).to.have.property('timeout').that.is.above(0);
    expect(messages[0].content).to.have.property('state', 'timer');

    definition.stop();
  });

  it('completes when timed out', (done) => {
    const definition = TimerEventDefinition(event, {
      type: 'bpmn:TimerEventDefinition',
      behaviour: {
        timeDuration: 'PT0.005S',
      },
    });

    event.broker.subscribeOnce('execution', 'execute.completed', () => done());

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('publish timeout event when timed out', (done) => {
    const definition = TimerEventDefinition(event, {
      type: 'bpmn:TimerEventDefinition',
      behaviour: {
        timeDuration: 'PT0.01S',
      },
    });

    event.broker.subscribeOnce('event', 'activity.timeout', (_, msg) => {
      expect(msg.content).to.have.property('timeout').that.is.at.least(10);
      expect(msg.content).to.have.property('state', 'timeout');
      done();
    });

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  it('completes without duration', (done) => {
    const definition = TimerEventDefinition(event, {
      type: 'bpmn:TimerEventDefinition',
    });

    event.broker.subscribeTmp('execution', 'execute.completed', () => {
      done();
    }, {noAck: true});

    definition.execute({
      fields: {},
      content: {
        executionId: 'event_1_0',
        index: 0,
        parent: {
          id: 'bound',
          executionId: 'event_1',
        },
      },
    });
  });

  describe('discard', () => {
    it('stops timer and cancels consumers', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;
      let timerMessage;
      broker.subscribeOnce('event', 'activity.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });

      ActivityApi(broker, timerMessage).discard();

      expect(definition.timer).to.not.be.ok;
      expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
    });
  });

  describe('stop', () => {
    it('stops timer, keeps message in queue and cancels consumers', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;
      const executeQ = broker.assertQueue('execute-q', {durable: true, autoDelete: false});
      broker.bindQueue(executeQ.name, 'execution', 'execute.#', {priority: 100});

      let timerMessage;
      broker.subscribeOnce('event', 'activity.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });

      ActivityApi(broker, timerMessage).stop();

      expect(definition.timer).to.not.be.ok;
      expect(executeQ).to.have.property('messageCount', 1);
      expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
    });
  });

  describe('resume execution', () => {
    it('ignores execute start message if redelivered', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      event.broker.subscribeOnce('execution', 'execute.timer', () => {
        throw new Error('Should have been ignored');
      });

      definition.execute({
        fields: {
          routingKey: 'execute.start',
          redelivered: true,
        },
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });
    });

    it('recovers with message timeout', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;

      let timerMessage;
      broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({
        fields: {
          routingKey: 'execute.start',
        },
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });

      setTimeout(() => {
        ActivityApi(broker, timerMessage).stop();

        let timerMsg;
        broker.subscribeOnce('event', 'activity.timer', (_, msg) => {
          timerMsg = msg;
        });

        broker.subscribeOnce('event', 'activity.timeout', (_, msg) => {
          expect(timerMsg.content).to.have.property('state', 'timer');
          expect(msg.content.runningTime).to.be.at.least(100).and.below(200);
          done();
        });

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);
      }, 20);
    });

    it('completes immediately if timeout has passed', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;

      let timerMessage;
      broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({
        fields: {
          routingKey: 'execute.start',
        },
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });

      setTimeout(() => {
        ActivityApi(broker, timerMessage).stop();

        broker.subscribeOnce('event', 'activity.timeout', (_, msg) => {
          expect(msg.content.runningTime).to.be.at.least(1000);
          done();
        });

        timerMessage.fields.redelivered = true;
        timerMessage.content.startedAt = new Date(Date.now() - 1000);
        definition.execute(timerMessage);
      }, 10);
    });

    it('can be stopped again', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;

      let timerMessage;
      broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({content: {executionId: 'def-execution-id'}});

      setTimeout(() => {
        ActivityApi(broker, timerMessage).stop();

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);

        ActivityApi(broker, timerMessage).stop();

        expect(definition.timer).to.not.be.ok;
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
        done();
      }, 10);
    });

    it('can be discarded', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
        },
      });

      const broker = event.broker;

      let timerMessage;
      broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
        timerMessage = msg;
      });

      definition.execute({content: {executionId: 'def-execution-id'}});

      setTimeout(() => {
        ActivityApi(broker, timerMessage).stop();

        broker.subscribeOnce('execution', 'execute.discard', () => {
          expect(definition.timer).to.not.be.ok;
          done();
        });

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);
        expect(definition.timer).to.be.ok;

        ActivityApi(broker, timerMessage).discard();
      }, 10);
    });
  });
});
