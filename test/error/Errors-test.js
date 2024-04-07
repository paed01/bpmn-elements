import { ActivityError, BpmnError, makeErrorFromMessage } from '../../src/error/Errors.js';

describe('Errors', () => {
  describe('ActivityError', () => {
    it('has name ActivityError', () => {
      expect(new ActivityError()).to.have.property('name', 'ActivityError');
    });

    it('has type ActivityError', () => {
      expect(new ActivityError()).to.have.property('type', 'ActivityError');
    });

    it('takes message as first argument', () => {
      expect(new ActivityError('unstable')).to.have.property('message', 'unstable');
    });

    it('sets message as description for serializing reasons', () => {
      expect(new ActivityError('unstable')).to.have.property('description', 'unstable');
    });

    it('sets source from activity message', () => {
      const err = new ActivityError('unstable', {
        fields: {},
        content: {},
        properties: {},
      });

      expect(err).to.have.property('source').that.eql({
        fields: {},
        content: {},
        properties: {},
      });
    });

    it('removes error from source message content', () => {
      const err = new ActivityError('unstable', {
        fields: {},
        content: {
          error: new Error('unstable'),
        },
        properties: {},
      });
      expect(err.source).to.have.property('content').that.eql({
        error: undefined,
      });
    });

    it('sets inner error code as code', () => {
      const err = new ActivityError(
        'unstable',
        {
          fields: {},
          content: {},
          properties: {},
        },
        new BpmnError('Failed', { errorCode: '503' }),
      );
      expect(err).to.have.property('code', '503');
    });

    it('sets inner error name as name', () => {
      const err = new ActivityError(
        'unstable',
        {
          fields: {},
          content: {},
          properties: {},
        },
        new BpmnError('Failed', { errorCode: '503' }),
      );
      expect(err).to.have.property('name', 'BpmnError');
    });
  });

  describe('BpmnError', () => {
    it('has name BpmnError', () => {
      expect(new BpmnError()).to.have.property('name', 'BpmnError');
    });

    it('has type BpmnError', () => {
      expect(new BpmnError()).to.have.property('type', 'BpmnError');
    });

    it('takes message as first argument', () => {
      expect(new BpmnError('unstable')).to.have.property('message', 'unstable');
    });

    it('sets description as message', () => {
      expect(new BpmnError('unstable')).to.have.property('description', 'unstable');
    });

    it('sets code from behaviour errorCode', () => {
      const err = new BpmnError('unstable', { errorCode: 'ERR_CODE' });
      expect(err).to.have.property('code', 'ERR_CODE');
    });

    it('sets code from behaviour errorCode as string', () => {
      const err = new BpmnError('unstable', { errorCode: 404 });
      expect(err).to.have.property('code', '404');
    });

    it('sets name from behaviour name', () => {
      const err = new BpmnError('unstable', { name: 'CustomError' });
      expect(err).to.have.property('name', 'CustomError');
    });

    it('sets id from behaviour id', () => {
      const err = new BpmnError('unstable', { id: 'Error_0' });
      expect(err).to.have.property('id', 'Error_0');
    });

    it('sets source from activity message', () => {
      const err = new BpmnError(
        'unstable',
        { id: 'Error_0' },
        {
          fields: {},
          content: {},
          properties: {},
        },
      );

      expect(err).to.have.property('source').that.eql({
        fields: {},
        content: {},
        properties: {},
      });
    });

    it('removes error from source message content', () => {
      const err = new BpmnError(
        'unstable',
        { id: 'Error_0' },
        {
          fields: {},
          content: {
            error: new Error('unstable'),
          },
          properties: {},
        },
      );
      expect(err.source).to.have.property('content').that.eql({
        error: undefined,
      });
    });
  });

  describe('makeErrorFromMessage(errorMessage)', () => {
    it('returns error instance if message content is a known error', () => {
      expect(makeErrorFromMessage({ content: new ActivityError() })).to.be.instanceof(ActivityError);
      expect(makeErrorFromMessage({ content: new BpmnError() })).to.be.instanceof(BpmnError);
      expect(makeErrorFromMessage({ content: new Error() })).to.be.instanceof(Error);
    });

    it('returns error instance if message content error is a known error', () => {
      expect(makeErrorFromMessage({ content: { error: new ActivityError() } })).to.be.instanceof(ActivityError);
      expect(makeErrorFromMessage({ content: { error: new BpmnError() } })).to.be.instanceof(BpmnError);
      expect(makeErrorFromMessage({ content: { error: new Error() } })).to.be.instanceof(Error);
    });

    it('returns ActivityError instance if message content error type is ActivityError', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
            },
          },
        }),
      ).to.be.instanceof(ActivityError);
    });

    it('returns ActivityError instance if with message from message', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              message: 'Unexpected',
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .with.property('message', 'Unexpected');
    });

    it('returns ActivityError instance if with message from description', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              description: 'Unexpected',
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .with.property('message', 'Unexpected');
    });

    it('returns ActivityError with source if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              source: {
                fields: {},
                content: {},
                properties: {},
              },
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .and.have.property('source')
        .that.eql({
          fields: {},
          content: {},
          properties: {},
        });
    });

    it('returns ActivityError with code if if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              code: 'ERR_CODE',
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .and.have.property('code', 'ERR_CODE');
    });

    it('returns ActivityError with name if if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              name: 'CustomError',
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .and.have.property('name', 'CustomError');
    });

    it('returns ActivityError with code from inner', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              inner: { code: 'ERR_CODE' },
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .and.have.property('code', 'ERR_CODE');
    });

    it('returns ActivityError with name from inner', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'ActivityError',
              inner: { name: 'CustomError' },
            },
          },
        }),
      )
        .to.be.instanceof(ActivityError)
        .and.have.property('name', 'CustomError');
    });

    it('returns BpmnError instance if message content error type is BpmnError', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
            },
          },
        }),
      ).to.be.instanceof(BpmnError);
    });

    it('returns BpmnError instance if with message from message', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              message: 'Unexpected',
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .with.property('message', 'Unexpected');
    });

    it('returns BpmnError instance if with message from description', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              description: 'Unexpected',
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .with.property('message', 'Unexpected');
    });

    it('returns BpmnError with source if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              source: {
                fields: {},
                content: {},
                properties: {},
              },
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .and.have.property('source')
        .that.eql({
          fields: {},
          content: {},
          properties: {},
        });
    });

    it('returns BpmnError with code if if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              code: 'ERR_CODE',
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .and.have.property('code', 'ERR_CODE');
    });

    it('returns BpmnError with name if if any', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              name: 'CustomError',
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .and.have.property('name', 'CustomError');
    });

    it('returns BpmnError with name', () => {
      expect(
        makeErrorFromMessage({
          content: {
            error: {
              type: 'BpmnError',
              name: 'MyError',
            },
          },
        }),
      )
        .to.be.instanceof(BpmnError)
        .and.have.property('name', 'MyError');
    });

    it('returns Error if error is missing from content', () => {
      expect(
        makeErrorFromMessage({
          fields: { routingKey: 'my.error' },
          content: {},
        }),
      )
        .to.be.instanceof(Error)
        .that.match(/my\.error/);

      expect(
        makeErrorFromMessage({
          content: {},
        }),
      )
        .to.be.instanceof(Error)
        .that.match(/malformatted/i);
    });
  });
});
