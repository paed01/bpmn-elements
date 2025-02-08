import { ActivityBroker } from '../src/EventBroker.js';
import { ActivityError } from '../src/error/Errors.js';
import { Formatter } from '../src/MessageFormatter.js';
import { Logger } from './helpers/testHelpers.js';

describe('MessageFormatter', () => {
  let formatter;
  /** @type {import('smqp').Broker} */
  let broker;
  beforeEach(() => {
    const activityBroker = new ActivityBroker({ id: 'element' });
    broker = activityBroker.broker;

    formatter = new Formatter({
      id: 'element',
      broker,
      logger: Logger('format'),
    });
  });

  it('calls callback if format queue is empty', (done) => {
    formatter.format(
      {
        fields: {
          routingKey: 'run.end',
        },
        content: {},
      },
      (err, _message, formatted) => {
        if (err) return done(err);
        expect(formatted).to.be.false;
        done();
      }
    );
  });

  describe('synchronous formatting', () => {
    it('calls callback with formatted content', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');
      formatQ.queueMessage({ routingKey: 'run.format.1' }, { me: 1 });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.true;
          expect(content).to.deep.equal({
            id: 'element',
            me: 1,
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
          done();
        }
      );
    });

    it('calls callback for every format complete', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      let result;

      formatQ.queueMessage({ routingKey: 'run.format.1' }, { me: 1 });
      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.start',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('me', 1);
      expect(formatQ.consumerCount, 'consumerCount').to.equal(0);

      formatQ.queueMessage({ routingKey: 'run.format.2' }, { me: 3 });
      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('me', 3);
    });

    it('multiple formatting messages completes all formatting', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.1' }, { me: 1 });
      formatQ.queueMessage({ routingKey: 'run.format.2' }, { me: 3 });
      formatQ.queueMessage({ routingKey: 'run.format.3' }, { foo: 'bar' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.true;
          expect(content).to.deep.equal({
            id: 'element',
            me: 3,
            foo: 'bar',
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          done();
        }
      );
    });

    it('unaltered content calls callback with formatted false', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, {});

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.false;
          expect(content).to.deep.equal({
            id: 'element',
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          done();
        }
      );
    });

    it('unaltered content calls callback with formatted false', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, {});

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.false;
          expect(content).to.deep.equal({
            id: 'element',
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          done();
        }
      );
    });
  });

  describe('asynchronous formatting', () => {
    it('calls callback with formatted content', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.true;
          expect(content).to.deep.equal({
            id: 'element',
            me: 1,
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'run.format.end' }, { me: 1 });
    });

    it('format on start message is honored', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start.1' }, { endRoutingKey: '#.end.1', started: true });

      setImmediate(() => formatQ.queueMessage({ routingKey: 'format.end.1' }, { ended: true }));

      const content = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.start',
        },
        content: {
          id: 'element',
        },
      });

      expect(content).to.deep.equal({
        id: 'element',
        started: true,
        ended: true,
      });
    });

    it('calls callback for every run when completed asynchronously', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');
      let result;

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });
      setImmediate(() => formatQ.queueMessage({ routingKey: 'run.format.end' }, { me: 1 }));

      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.start',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('me', 1);
      expect(formatQ.messageCount, 'messageCount').to.equal(0);
      expect(formatQ.consumerCount, 'consumerCount').to.equal(0);

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });
      setImmediate(() => formatQ.queueMessage({ routingKey: 'run.format.end' }, { foo: 'bar' }));

      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('foo', 'bar');
      expect(formatQ.messageCount, 'messageCount').to.equal(0);
      expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
    });

    it('calls callback for every run when completed immediately', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');
      let result;

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });
      formatQ.queueMessage({ routingKey: 'run.format.end' }, { me: 1 });

      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.start',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('me', 1);
      expect(formatQ.messageCount, 'messageCount').to.equal(0);
      expect(formatQ.consumerCount, 'consumerCount').to.equal(0);

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });
      formatQ.queueMessage({ routingKey: 'run.format.end' }, { foo: 'bar' });

      result = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(result).to.have.property('foo', 'bar');
      expect(formatQ.messageCount, 'messageCount').to.equal(0);
      expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
    });

    it('multiple async formatting calls callback when complete', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start.1' }, { endRoutingKey: '#.end.1' });
      formatQ.queueMessage({ routingKey: 'run.format.start.2' }, { endRoutingKey: 'run.format.end.2' });
      formatQ.queueMessage({ routingKey: 'run.format.start.3' }, { endRoutingKey: '*.format.end.3' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.true;
          expect(content).to.deep.equal({
            id: 'element',
            me: 3,
            foo: 'bar',
          });
          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'my.format.end.3' }, { me: 1 });
      formatQ.queueMessage({ routingKey: 'run.format.end.2' }, { foo: 'bar' });
      formatQ.queueMessage({ routingKey: 'my.format.end.1' }, { me: 3 });
    });

    it('unaltered content calls callback with formatted false', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err, content, formatted) => {
          if (err) return done(err);
          expect(formatted).to.be.false;
          expect(content).to.deep.equal({
            id: 'element',
          });
          expect(formatQ.messageCount, 'messageCount').to.equal(0);
          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'run.format.end' }, {});
    });

    it('failed formatting calls callback with default error', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err) => {
          if (!err) return done(new Error('Shouldn´t happen'));

          expect(err).to.be.instanceOf(ActivityError);
          expect(err.message).to.equal('formatting failed');
          expect(err.source).to.deep.equal({
            fields: {
              routingKey: 'run.end',
            },
            content: {
              id: 'element',
            },
            properties: {},
          });

          expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'run.format.error' }, {});
    });

    it('error without message calls callback with default error message', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start' }, { endRoutingKey: 'run.format.end' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err) => {
          if (!err) return done(new Error('Shouldn´t happen'));

          expect(err).to.be.instanceOf(ActivityError);
          expect(err.message).to.equal('formatting failed');
          expect(err.source).to.deep.equal({
            fields: {
              routingKey: 'run.end',
            },
            content: {
              id: 'element',
            },
            properties: {},
          });

          expect(formatQ.consumerCount, 'consumerCount').to.equal(0);
          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'run.format.error' }, { error: new Error() });
    });

    it('multiple async formatting calls callback with error if one fails', (done) => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start.1' }, { endRoutingKey: '#.end.1' });
      formatQ.queueMessage({ routingKey: 'run.format.start.2' }, { endRoutingKey: 'run.format.end.2' });
      formatQ.queueMessage({ routingKey: 'run.format.start.3' }, { endRoutingKey: '*.format.end.3' });

      formatter.format(
        {
          fields: {
            routingKey: 'run.end',
          },
          content: {
            id: 'element',
          },
        },
        (err) => {
          if (!err) return done(new Error('Shouldn´t happen'));

          expect(err).to.be.instanceOf(ActivityError);
          expect(err.message).to.equal('Timeout');
          expect(err.source).to.deep.equal({
            fields: {
              routingKey: 'run.end',
            },
            content: {
              id: 'element',
            },
            properties: {},
          });

          done();
        }
      );

      formatQ.queueMessage({ routingKey: 'my.format.end.error' }, { error: new Error('Timeout') });
    });

    it('lingering exec message from previous run is ignored', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.start.1' }, { endRoutingKey: '#.end.1' });
      formatQ.queueMessage({ routingKey: 'run.format.start.error' }, {});

      await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.start',
        },
        content: {
          id: 'element',
        },
      }).catch(() => {});

      expect(formatQ.messageCount, '#1 messageCount').to.equal(1);

      formatQ.queueMessage({ routingKey: 'run.format.2' }, { endRoutingKey: '#.end.2' });
      formatQ.queueMessage({ routingKey: 'format.end.2' }, { foo: 'bar' });

      const content = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(content).to.deep.equal({
        id: 'element',
        foo: 'bar',
      });
      expect(formatQ.messageCount, '#2 messageCount').to.equal(0);
    });
  });

  describe('combined', () => {
    it('multiple formatting using format exchange calls callback when complete', async () => {
      broker.publish('format', 'run.format.1', { me: 1 });
      broker.publish('format', 'run.format.start.2', { endRoutingKey: 'run.format.end.2' });
      broker.publish('format', 'run.format.start.3', { endRoutingKey: '*.format.end.3' });

      setImmediate(() => {
        broker.publish('format', 'run.format.2', { you: 1 });
        broker.publish('format', 'run.format.end.3', { me: 3 });
        broker.publish('format', 'run.format.end.2', { foo: 'bar' });
      });

      const content = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(content).to.deep.equal({
        id: 'element',
        me: 3,
        you: 1,
        foo: 'bar',
      });
    });

    it('init asynchronous formatting before formatting using format exchange calls callback when complete', async () => {
      broker.publish('format', 'run.format.1', { me: 1 });
      broker.publish('format', 'run.format.start.2', { endRoutingKey: 'run.format.end.2' });
      broker.publish('format', 'run.format.start.3', { endRoutingKey: '*.format.end.3' });

      const promisedContent = awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      setImmediate(() => {
        broker.publish('format', 'run.format.2', { you: 1 });
        broker.publish('format', 'run.format.end.3', { me: 3 });
        broker.publish('format', 'run.format.end.2', { foo: 'bar' });
      });

      const content = await promisedContent;

      expect(content).to.deep.equal({
        id: 'element',
        me: 3,
        you: 1,
        foo: 'bar',
      });
    });

    it('multiple formatting using queue message calls callback when complete', async () => {
      const formatQ = formatter.broker.getQueue('format-run-q');

      formatQ.queueMessage({ routingKey: 'run.format.1' }, { me: 1 });
      formatQ.queueMessage({ routingKey: 'run.format.start.2' }, { endRoutingKey: 'run.format.end.2' });
      formatQ.queueMessage({ routingKey: 'run.format.start.3' }, { endRoutingKey: '*.format.end.3' });

      setImmediate(() => {
        formatQ.queueMessage({ routingKey: 'run.format.2' }, { you: 1 });
        formatQ.queueMessage({ routingKey: 'my.format.end.3' }, { me: 3 });
        formatQ.queueMessage({ routingKey: 'run.format.end.2' }, { foo: 'bar' });
      });

      const content = await awaitCallback(formatter, {
        fields: {
          routingKey: 'run.end',
        },
        content: {
          id: 'element',
        },
      });

      expect(content).to.deep.equal({
        id: 'element',
        me: 3,
        you: 1,
        foo: 'bar',
      });
    });
  });
});

function awaitCallback(formatter, ...args) {
  return new Promise((resolve, reject) => {
    formatter.format(...args, (err, content) => {
      if (err) return reject(err);
      resolve(content);
    });
  });
}
