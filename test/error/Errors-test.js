import {ActivityError, BpmnError} from '../../src/error/Errors';

describe('Errors', () => {
  describe('ActivityError', () => {
    it('has name ActivityError', () => {
      expect(new ActivityError()).to.have.property('name', 'ActivityError');
    });

    it('takes message', () => {
      expect(new ActivityError('unstable')).to.have.property('message', 'unstable');
    });

    it('sets source message from activity', () => {
      const err = new ActivityError('unstable', {
        fields: {},
        content: {},
        properties: {},
      });

      expect(err).to.have.property('fields').that.eql({});
      expect(err).to.have.property('content').that.eql({
        error: undefined,
      });
      expect(err).to.have.property('properties').that.eql({});
    });

    it('removes error from source message content', () => {
      const err = new ActivityError('unstable', {
        fields: {},
        content: {
          error: new Error('unstable'),
        },
        properties: {},
      });
      expect(err).to.have.property('fields').that.eql({});
      expect(err).to.have.property('content').that.eql({
        error: undefined,
      });
      expect(err).to.have.property('properties').that.eql({});
    });

    it('forwards error properties to activity error', () => {
      const err = new ActivityError('unstable', {
        fields: {},
        content: {},
        properties: {},
      }, new BpmnError('Failed', {errorCode: '503'}));
      expect(err).to.have.property('code', '503');
    });
  });

  describe('BpmnError', () => {
    it('has name BpmnError', () => {
      expect(new BpmnError()).to.have.property('name', 'BpmnError');
    });

    it('takes message', () => {
      expect(new BpmnError('unstable')).to.have.property('message', 'unstable');
    });

    it('sets code from behaviour errorCode', () => {
      const err = new BpmnError('unstable', {errorCode: 'ERR_CODE'});
      expect(err).to.have.property('code', 'ERR_CODE');
    });

    it('sets code from behaviour errorCode as string', () => {
      const err = new BpmnError('unstable', {errorCode: 404});
      expect(err).to.have.property('code', '404');
    });

    it('sets name from behaviour name', () => {
      const err = new BpmnError('unstable', {name: 'CustomError'});
      expect(err).to.have.property('name', 'CustomError');
    });

    it('sets id from behaviour id', () => {
      const err = new BpmnError('unstable', {id: 'Error_0'});
      expect(err).to.have.property('id', 'Error_0');
    });

    it('sets source message from activity', () => {
      const err = new BpmnError('unstable', undefined, {
        fields: {},
        content: {},
        properties: {},
      });

      expect(err).to.have.property('fields').that.eql({});
      expect(err).to.have.property('content').that.eql({
        error: undefined,
      });
      expect(err).to.have.property('properties').that.eql({});
    });

    it('removes error from source message content', () => {
      const err = new BpmnError('unstable', undefined, {
        fields: {},
        content: {
          error: new Error('unstable'),
        },
        properties: {},
      });
      expect(err).to.have.property('fields').that.eql({});
      expect(err).to.have.property('content').that.eql({
        error: undefined,
      });
      expect(err).to.have.property('properties').that.eql({});
    });
  });
});
