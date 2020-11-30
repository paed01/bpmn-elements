import ck from 'chronokinesis';
import Environment from '../../src/Environment';
import testHelpers from '../helpers/testHelpers';
import TimerEventDefinition from '../../src/eventDefinitions/TimerEventDefinition';
import {ActivityApi, DefinitionApi} from '../../src/Api';
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

  describe('timeDuration', () => {
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
      expect(messages[0].content).to.have.property('timeDuration', 'PT0.1S');
      expect(messages[0].content).to.have.property('timeout').that.is.above(0);
      expect(messages[0].content).to.have.property('state', 'timer');
      expect(messages[0].content).to.have.property('parent').with.property('id', 'bound');

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

    it('invalid ISO duration ignores the duration and stalls execution', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'Just do it in 10 secs',
        },
      });

      event.broker.subscribeTmp('execution', 'execute.completed', () => {
        throw new Error('Should not complete');
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

      expect(definition.timer).to.not.be.ok;
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
            expect(msg.content.runningTime).to.be.at.least(99).and.below(200);
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

  describe('timeDate', () => {
    beforeEach(() => {
      ck.travel('1993-06-26');
    });
    afterEach(ck.reset);

    it('resolves date from event scope', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDate: '${content.input.date}',
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
            date: new Date('1993-06-27'),
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.timer');
      expect(messages[0].content).to.have.property('timeDate').that.deep.equal(new Date('1993-06-27'));
      expect(messages[0].content).to.have.property('timeout').that.is.above(0);
      expect(messages[0].content).to.have.property('state', 'timer');
      expect(messages[0].content).to.have.property('parent').with.property('id', 'bound');

      definition.stop();
    });

    it('completes when timed out', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDate: new Date(Date.now() + 100).toISOString(),
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

    it('completes immediately if date is due', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDate: '${content.input.date}',
        },
      });

      ck.travel(1993, 5, 28);

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.timeout', (_, msg) => {
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
            date: new Date('1993-06-27'),
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].content).to.have.property('timeDate').that.deep.equal(new Date('1993-06-27'));
      expect(messages[0].content).to.have.property('state', 'timeout');
      expect(messages[0].content).to.have.property('parent').with.property('id', 'bound');

      definition.stop();
    });

    it('unresolved expression completes the execution', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDate: '${environment.variables.dueDate}',
        },
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

      expect(definition.timer).to.not.be.ok;
    });

    it('invalid date stalls the execution', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDate: 'Last tuesday',
        },
      });

      event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
        expect(msg.content).to.have.property('timeDate', 'Last tuesday');
        expect(msg.content).to.not.have.property('timeout');
      }, {noAck: true});

      event.broker.subscribeTmp('execution', 'execute.completed', () => {
        throw new Error('Should not complete');
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

      expect(definition.timer).to.not.be.ok;
    });

    describe('resume execution', () => {
      it('ignores execute start message if redelivered', () => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeDate: '1993-06-27',
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

        definition.stop();
      });

      it('publishes timer event message with resume message timeDate', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeDate: '1993-06-27',
          },
        });

        event.broker.subscribeOnce('event', 'activity.timer', (_, message) => {
          expect(message.content).to.have.property('timeDate').that.deep.equal(new Date('1993-06-28'));
          done();
        });

        definition.execute({
          fields: {
            routingKey: 'execute.timer',
            redelivered: true,
          },
          content: {
            executionId: 'event_1_0',
            index: 0,
            timeDate: '1993-06-28',
            parent: {
              id: 'bound',
              executionId: 'event_1',
            },
          },
        });

        definition.stop();
      });

      it('publishes timer event message with resolved timeDate as fallback', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeDate: '1993-06-27',
          },
        });

        event.broker.subscribeOnce('event', 'activity.timer', (_, message) => {
          expect(message.content).to.have.property('timeDate').that.deep.equal(new Date('1993-06-27'));
          done();
        });

        definition.execute({
          fields: {
            routingKey: 'execute.timer',
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

        definition.stop();
      });

      it('completes immediately if date is due', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeDate: '1993-06-27',
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
            timeDate: '1993-06-27',
            startedAt: new Date(),
            parent: {
              id: 'bound',
              executionId: 'event_1',
            },
          },
        });

        ActivityApi(broker, timerMessage).stop();

        ck.travel('1993-06-28');

        broker.subscribeOnce('event', 'activity.timeout', (_, msg) => {
          expect(msg.content.runningTime).to.be.above(0);
          done();
        });

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);
      });

      it('invalid date stalls the execution', () => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeDate: 'Last tuesday',
          },
        });

        event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
          expect(msg.content).to.have.property('timeDate', 'Last tuesday');
          expect(msg.content).to.not.have.property('timeout');
          ActivityApi(event.broker, msg).stop();
        }, {noAck: true});

        event.broker.subscribeTmp('execution', 'execute.completed', () => {
          throw new Error('Should not complete');
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

        expect(definition.timer).to.not.be.ok;
      });

    });
  });

  describe('timeCycle', () => {
    it('resolves cycle from event scope', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeCycle: '${content.input.cycle}',
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
            cycle: 'R3/PT10H',
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.timer');
      expect(messages[0].content).to.have.property('timeCycle', 'R3/PT10H');
      expect(messages[0].content).to.not.have.property('timeout');
      expect(messages[0].content).to.have.property('state', 'timer');
      expect(messages[0].content).to.have.property('parent').with.property('id', 'bound');

      definition.stop();
    });

    describe('resume execution', () => {
      it('ignores execute start message if redelivered', () => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R3/PT10H',
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

      it('publishes timer event message with resume message timeCycle', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R5/PT12H',
          },
        });

        event.broker.subscribeOnce('event', 'activity.timer', (_, message) => {
          expect(message.content).to.have.property('timeCycle', 'R3/PT10H');
          done();
        });

        definition.execute({
          fields: {
            routingKey: 'execute.timer',
            redelivered: true,
          },
          content: {
            executionId: 'event_1_0',
            index: 0,
            timeCycle: 'R3/PT10H',
            parent: {
              id: 'bound',
              executionId: 'event_1',
            },
          },
        });
      });

      it('publishes timer event message with resolved timeCycle as fallback', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R3/PT10H',
          },
        });

        event.broker.subscribeOnce('event', 'activity.timer', (_, message) => {
          expect(message.content).to.have.property('timeCycle', 'R3/PT10H');
          done();
        });

        definition.execute({
          fields: {
            routingKey: 'execute.timer',
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

      it('can be stopped again', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R5/PT12H',
          },
        });

        const broker = event.broker;

        let timerMessage;
        broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
          timerMessage = msg;
        });

        definition.execute({content: {executionId: 'def-execution-id'}});

        ActivityApi(broker, timerMessage).stop();

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);

        ActivityApi(broker, timerMessage).stop();

        expect(definition.timer).to.not.be.ok;
        expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
        done();
      });

      it('can be discarded', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R5/PT12H',
          },
        });

        const broker = event.broker;

        let timerMessage;
        broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
          timerMessage = msg;
        });

        definition.execute({content: {executionId: 'def-execution-id'}});

        ActivityApi(broker, timerMessage).stop();

        broker.subscribeOnce('execution', 'execute.discard', () => {
          done();
        });

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);

        ActivityApi(broker, timerMessage).discard();
      });

      it('can be canceled', (done) => {
        const definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            timeCycle: 'R5/PT12H',
          },
        });

        const broker = event.broker;

        let timerMessage;
        broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
          timerMessage = msg;
        });

        definition.execute({content: {executionId: 'def-execution-id'}});

        ActivityApi(broker, timerMessage).stop();

        broker.subscribeOnce('execution', 'execute.completed', () => {
          done();
        });

        timerMessage.fields.redelivered = true;
        definition.execute(timerMessage);

        ActivityApi(broker, timerMessage).cancel();
      });
    });
  });

  describe('a definition with timeDuration, timeDate, and timeCycle', () => {
    before(() => {
      ck.travel('1993-06-26T10:00Z');
    });
    after(ck.reset);

    it('publishes one execute timer message', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT1M',
          timeDate: '1993-06-27',
          timeCycle: 'R3/PT10H',
        },
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.timer', (_, msg) => {
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
        },
      });

      expect(messages).to.have.length(1);

      expect(messages[0].content).to.deep.include({
        timeDuration: 'PT1M',
        timeDate: new Date('1993-06-27'),
        timeCycle: 'R3/PT10H',
      });

      definition.stop();
    });

    it('publishes one execute activity timer message', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT1M',
          timeDate: '1993-06-27',
          timeCycle: 'R3/PT10H',
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
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
        },
      });

      expect(messages).to.have.length(1);

      expect(messages[0].content).to.deep.include({
        timeDuration: 'PT1M',
        timeDate: new Date('1993-06-27'),
        timeCycle: 'R3/PT10H',
      });

      definition.stop();
    });

    it('completes when time date is due', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT1Y',
          timeDate: new Date(Date.now() + 100).toISOString(),
          timeCycle: 'R3/PT10H',
        },
      });

      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        expect(msg.content).to.have.property('runningTime').that.is.above(0);
        expect(definition.timer).to.not.be.ok;
        done();
      }, {noAck: true});

      setTimeout(() => {
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
      }, 60);
    });

    it('completes when duration expires', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT0.1S',
          timeDate: '1993-06-27',
          timeCycle: 'R3/PT10H',
        },
      });

      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        expect(msg.content).to.have.property('runningTime').that.is.above(0);
        expect(definition.timer).to.not.be.ok;
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
  });

  [
    {timeDuration: 'PT1M'},
    {timeDate: '1993-06-27'},
    {timeCycle: 'R3/PT10H'},
    {
      timeDuration: 'PT1M',
      timeDate: '1993-06-27',
      timeCycle: 'R3/PT10H',
    },
    {},
  ].forEach((timer) => {
    const descr = Object.keys(timer).join(', ') || 'no timer';
    describe(descr, () => {
      let definition;
      beforeEach(() => {
        ck.travel('1993-06-26');
        definition = TimerEventDefinition(event, {
          type: 'bpmn:TimerEventDefinition',
          behaviour: {
            ...timer,
          },
        });
      });
      after(ck.reset);

      describe('cancel ' + descr, () => {
        it('completes when parent is canceled', (done) => {
          const messages = [];
          event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
            messages.push(msg);
          }, {noAck: true});

          event.broker.subscribeOnce('execution', 'execute.completed', () => {
            expect(messages[1].fields).to.have.property('routingKey', 'activity.timeout');
            expect(messages[1].content).to.have.property('runningTime');
            expect(definition.timer).to.not.be.ok;
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

          ActivityApi(event.broker, messages[0]).cancel();
        });

        it('completes when parent is canceled on activity timer event', (done) => {
          event.broker.subscribeOnce('execution', 'execute.completed', () => {
            expect(definition.timer).to.not.be.ok;
            done();
          });

          event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
            ActivityApi(event.broker, msg).cancel();
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

        it('completes if canceled on activity timer event', (done) => {
          event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
            ActivityApi(event.broker, msg).cancel();
          }, {noAck: true});

          event.broker.subscribeTmp('execution', 'execute.completed', () => {
            expect(definition.timer).to.not.be.ok;
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

        it('completes when delegated a canceled with parent id', (done) => {
          const messages = [];
          event.broker.subscribeTmp('event', 'activity.timeout', (_, msg) => {
            messages.push(msg);
          }, {noAck: true});

          event.broker.subscribeOnce('execution', 'execute.completed', () => {
            expect(messages[0].content).to.have.property('runningTime');
            expect(definition.timer).to.not.be.ok;
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

          DefinitionApi(event.broker, {content: {id: 'Def_1', executionId: 'Def_1_1'}}).cancel({
            id: 'event',
          }, {delegate: true});
        });

        it('ignored when delegated cancel with other parent id', () => {
          event.broker.subscribeOnce('execution', 'execute.completed', (_, {content}) => {
            if (content.state === 'cancel') throw new Error('Should have ignored cancel');
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

          DefinitionApi(event.broker, {content: {id: 'Def_1', executionId: 'Def_1_1'}}).cancel({
            id: 'task',
          }, {delegate: true});

          definition.stop();
        });

        it('completes when delegated cancel with event definition execution id', (done) => {
          const messages = [];
          event.broker.subscribeTmp('event', 'activity.timeout', (_, msg) => {
            messages.push(msg);
          }, {noAck: true});

          event.broker.subscribeOnce('execution', 'execute.completed', () => {
            expect(messages[0].content).to.have.property('runningTime');
            expect(definition.timer).to.not.be.ok;
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

          DefinitionApi(event.broker, {content: {id: 'Def_1', executionId: 'Def_1_1'}}).cancel({
            executionId: 'event_1_0',
          }, {delegate: true});
        });

        it('ignored when delegated cancel with parent id but different execution id', () => {
          event.broker.subscribeOnce('execution', 'execute.completed', (_, {content}) => {
            if (content.state === 'cancel') throw new Error('Should have ignored cancel');
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

          DefinitionApi(event.broker, {
            content: {
              id: 'Def_1',
              executionId: 'Def_1_1',
            },
          }).cancel({
            id: 'event',
            executionId: 'event_1_1',
          }, {delegate: true});

          definition.stop();
        });
      });

      describe('discard ' + descr, () => {
        it('stops timer and cancels consumers', () => {
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

        it('completes when discarded on activity timer event', (done) => {
          event.broker.subscribeOnce('execution', 'execute.discard', () => {
            expect(definition.timer).to.not.be.ok;
            done();
          });

          event.broker.subscribeTmp('event', 'activity.timer', (_, msg) => {
            ActivityApi(event.broker, msg).discard();
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
      });

      describe('stop ' + descr, () => {
        it('on activity timer event keeps message in queue and cancels consumers', () => {
          const broker = event.broker;
          const executeQ = broker.assertQueue('execute-q', {durable: true, autoDelete: false});
          broker.bindQueue(executeQ.name, 'execution', 'execute.#', {priority: 100});

          broker.subscribeOnce('event', 'activity.timer', (_, msg) => {
            ActivityApi(broker, msg).stop();
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

          expect(definition.timer).to.not.be.ok;
          expect(executeQ).to.have.property('messageCount', 1);
          expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
        });
      });

      if (descr !== 'no timer') {
        describe('resume ' + descr, () => {
          it('can be stopped again', (done) => {
            const broker = event.broker;

            let timerMessage;
            broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
              timerMessage = msg;
            });

            definition.execute({content: {executionId: 'def-execution-id'}});

            ActivityApi(broker, timerMessage).stop();

            timerMessage.fields.redelivered = true;
            definition.execute(timerMessage);

            ActivityApi(broker, timerMessage).stop();

            expect(definition.timer).to.not.be.ok;
            expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
            done();
          });

          it('can be discarded', (done) => {
            const broker = event.broker;

            let timerMessage;
            broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
              timerMessage = msg;
            });

            definition.execute({content: {executionId: 'def-execution-id'}});

            ActivityApi(broker, timerMessage).stop();

            broker.subscribeOnce('execution', 'execute.discard', () => {
              done();
            });

            timerMessage.fields.redelivered = true;
            definition.execute(timerMessage);

            ActivityApi(broker, timerMessage).discard();
          });

          it('can be canceled', (done) => {
            const broker = event.broker;

            let timerMessage;
            broker.subscribeOnce('execution', 'execute.timer', (_, msg) => {
              timerMessage = msg;
            });

            definition.execute({content: {executionId: 'def-execution-id'}});

            ActivityApi(broker, timerMessage).stop();

            broker.subscribeOnce('execution', 'execute.completed', () => {
              done();
            });

            timerMessage.fields.redelivered = true;
            definition.execute(timerMessage);

            ActivityApi(broker, timerMessage).cancel();
          });
        });
      }
    });
  });

  describe('start message with timeout', () => {
    it('completes when timed out', (done) => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {},
      });

      event.broker.subscribeOnce('execution', 'execute.completed', (_, msg) => {
        expect(msg.content).to.have.property('timeout', 50);
        expect(msg.content).to.have.property('startedAt');
        expect(msg.content).to.have.property('runningTime').that.is.above(45);
        done();
      });

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          timeout: 50,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });
    });
  });

  describe('no timer', () => {
    it('completes without any timers', (done) => {
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
  });

  describe('edge cases', () => {
    it('resets timer if executed twice', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeDuration: 'PT1M',
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
        },
      });
      const timer = definition.timer;

      definition.execute({
        fields: {},
        content: {
          executionId: 'event_1_1',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
          },
        },
      });
      expect(timer === definition.timer).to.be.false;

      definition.stop();
    });

    it('cancel message from outside without delegate is ignored', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeCycle: '* * * * * * 5',
        },
      });

      event.broker.subscribeOnce('execution', 'execute.completed', () => {
        throw new Error('Should have ignored cancel');
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

      DefinitionApi(event.broker, {content: {id: 'Def_1', executionId: 'Def_1_1'}}).cancel({
        id: 'event',
      });

      definition.stop();
    });

    it('delegated cancel message without message is ignored', () => {
      const definition = TimerEventDefinition(event, {
        type: 'bpmn:TimerEventDefinition',
        behaviour: {
          timeCycle: '0 0/5 * 1/1 * ? *',
        },
      });

      event.broker.subscribeOnce('execution', 'execute.completed', () => {
        throw new Error('Should have ignored cancel');
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

      DefinitionApi(event.broker, {content: {id: 'Def_1', executionId: 'Def_1_1'}}).cancel(undefined, {delegate: true});

      definition.stop();
    });
  });
});
