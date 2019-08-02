import Message from '../../src/activity/Message';
import MessageEventDefinition from '../../src/eventDefinitions/MessageEventDefinition';
import Environment from '../../src/Environment';
import {ActivityBroker} from '../../src/EventBroker';
import {Logger} from '../helpers/testHelpers';

describe('MessageEventDefinition', () => {
  let event;
  beforeEach(() => {
    const environment = Environment({Logger});
    event = {
      id: 'event',
      environment,
      broker: ActivityBroker(this).broker,
      getActivityById(id) {
        if (id !== 'message_1') return;
        return Message({
          id: 'message_1',
          type: 'bpmn:Message',
          name: 'My Message ${content.id}',
        }, {environment});
      },
    };
  });

  describe('catching', () => {
    it('publishes wait event on parent broker with resolved message', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
        behaviour: {
          messageRef: {
            id: 'message_1'
          }
        }
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchMessage.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

      expect(messages[0].content.message).to.have.property('id', 'message_1');
      expect(messages[0].content.message).to.have.property('name', 'My Message event_1');
    });

    it('ignores message and keeps listeners if message id doesn´t match', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
        behaviour: {
          messageRef: {
            id: 'message_1'
          }
        }
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      const consumerCount = event.broker.consumerCount;
      expect(consumerCount).to.be.above(0);

      event.broker.publish('api', 'activity.message.event_1', {
        message: {
          id: 'message_2'
        }
      });

      expect(messages).to.have.length(0);

      expect(event.broker).to.have.property('consumerCount', consumerCount);
    });

    it('completes and clears listeners when expected message is caught', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
        behaviour: {
          messageRef: {
            id: 'message_1'
          }
        }
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag-1'});

      event.broker.subscribeTmp('event', 'activity.catch', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag-2'});

      catchMessage.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.message.event_1', {
        message: {
          id: 'message_1',
          msg: 'ping',
        }
      });
      event.broker.cancel('_test-tag-1');
      event.broker.cancel('_test-tag-2');

      expect(messages).to.have.length(2);
      expect(messages[0]).to.have.property('fields').with.property('routingKey', 'activity.catch');
      expect(messages[0].content).to.have.property('message').that.eql({
        id: 'message_1',
        msg: 'ping'
      });

      expect(messages[1]).to.have.property('fields').with.property('routingKey', 'execute.completed');
      expect(messages[1].content).to.have.property('output').that.eql({
        id: 'message_1',
        msg: 'ping'
      });

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners when anonymous message is caught', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'process.message.pid_1', {});
      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if messaged before execution', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
        behaviour: {
          messageRef: {
            id: 'message_1'
          }
        }
      });

      event.broker.publish('api', 'definition.message.def_1', {
        message: event.getActivityById('message_1').resolve()
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if discarded', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if signaled', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.signal.event_1_0', {}, {type: 'signal'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears listeners if stopped', () => {
      const catchMessage = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchMessage.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event_1',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });
  });

  describe('throwing', () => {
    it('publishes message event on parent broker with resolved message', () => {
      event.isThrowing = true;

      const definition = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
        behaviour: {
          messageRef: {
            id: 'message_1'
          }
        }
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.message');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

      expect(messages[0].content.message).to.have.property('id', 'message_1');
      expect(messages[0].content.message).to.have.property('name', 'My Message event_1');
    });

    it('publishes message event on parent broker with anonymous message', () => {
      event.isThrowing = true;

      const definition = MessageEventDefinition(event, {
        type: 'bpmn:MessageEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          id: 'event_1',
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'event',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.message');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');

      expect(messages[0].content.message).to.not.have.property('id');
      expect(messages[0].content.message).to.have.property('name', 'anonymous');
    });
  });

  // it('publishes wait event on parent broker', () => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   const messages = [];
  //   event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
  //     messages.push(msg);
  //   }, {noAck: true});

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //         path: [{
  //           id: 'theProcess',
  //           executionId: 'theProcess_0'
  //         }]
  //       },
  //     },
  //   });

  //   expect(messages).to.have.length(1);
  //   expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
  //   expect(messages[0].content).to.have.property('executionId', 'event_1');
  //   expect(messages[0].content.parent).to.have.property('id', 'theProcess');
  //   expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
  // });

  // it('completes when signaled', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   let api;
  //   event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
  //     api = ActivityApi(event.broker, message);
  //   });

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //       },
  //     },
  //   });

  //   event.broker.subscribeOnce('execution', 'execute.completed', () => done());

  //   api.signal();
  // });

  // it('sends signal as and output when completed by signal', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   event.broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
  //     expect(message.content).to.have.property('output').that.eql({data: 1});
  //     done();
  //   });

  //   event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
  //     ActivityApi(event.broker, message).signal({data: 1});
  //   });

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //       },
  //     },
  //   });
  // });

  // it('leaves no lingering listeners when completed by signal', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   event.broker.subscribeOnce('execution', 'execute.completed', () => {
  //     expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
  //     done();
  //   });

  //   event.broker.subscribeOnce('event', 'activity.wait', (_, message) => {
  //     ActivityApi(event.broker, message).signal();
  //   });

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //       },
  //     },
  //   });
  // });

  // it('leaves no lingering listeners if discarded', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   event.broker.subscribeOnce('event', 'activity.wait', () => {
  //     ActivityApi(event.broker, {
  //       fields: {},
  //       content: {
  //         executionId: 'event_1_0',
  //         index: 0,
  //         parent: {
  //           id: 'event_1',
  //           executionId: 'event_1',
  //         },
  //       },
  //     }).discard();
  //   });

  //   event.broker.subscribeOnce('execution', 'execute.discard', () => {
  //     expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
  //     done();
  //   });

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //       },
  //     },
  //   });
  // });

  // it('leaves no lingering listeners if stopped', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   event.broker.subscribeOnce('event', 'activity.wait', () => {
  //     ActivityApi(event.broker, {
  //       fields: {},
  //       content: {
  //         executionId: 'event_1_0',
  //         index: 0,
  //         parent: {
  //           id: 'event_1',
  //           executionId: 'event_1',
  //         },
  //       },
  //     }).stop();
  //     expect(event.broker.getExchange('api')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getExchange('event')).to.have.property('bindingCount', 0);
  //     expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 0);
  //     done();
  //   });

  //   definition.execute({
  //     fields: {},
  //     content: {
  //       executionId: 'event_1_0',
  //       index: 0,
  //       parent: {
  //         id: 'event_1',
  //         executionId: 'event_1',
  //       },
  //     },
  //   });
  // });

  // it('listens on parent message queue', () => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   definition.execute({content: {executionId: 'def-execution-id'}});
  //   expect(event.broker.getQueue('messages')).to.have.property('consumerCount', 1);
  // });

  // it('completes if message is in message queue before execute', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   event.broker.sendToQueue('messages', {data: 1});

  //   event.broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
  //     expect(message.content).to.have.property('output').that.eql({data: 1});
  //     done();
  //   });

  //   definition.execute({content: {executionId: 'def-execution-id'}});
  // });

  // it('doesn´t publish wait message if message is present before execute', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   const broker = event.broker;
  //   broker.sendToQueue('messages', {data: 1});

  //   broker.subscribeOnce('execution', 'execute.wait', () => {
  //     throw new Error('Shouldnt happen');
  //   });

  //   broker.subscribeOnce('execution', 'execute.completed', (_, message) => {
  //     expect(message.content).to.have.property('output').that.eql({data: 1});
  //     done();
  //   });

  //   definition.execute({content: {executionId: 'def-execution-id'}});

  // });

  // it('leaves no lingering api or message listeners if message is consumed', (done) => {
  //   const definition = MessageEventDefinition(event, {
  //     type: 'bpmn:MessageEventDefinition',
  //   });

  //   const broker = event.broker;
  //   broker.sendToQueue('messages', {data: 1});

  //   broker.subscribeOnce('execution', 'execute.completed', () => {
  //     expect(broker.getExchange('api')).to.have.property('bindingCount', 0);
  //     expect(broker.getQueue('messages')).to.have.property('consumerCount', 0);
  //     done();
  //   });

  //   definition.execute({content: {executionId: 'def-execution-id'}});
  // });
});
