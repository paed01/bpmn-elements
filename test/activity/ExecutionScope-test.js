import Environment from '../../src/Environment.js';
import ExecutionScope from '../../src/activity/ExecutionScope.js';
import {ActivityError, BpmnError} from '../../src/error/Errors.js';

describe('ExecutionScope', () => {
  it('exposes environment, error classes, and passed message', () => {
    const activity = {
      id: 'task1',
      type: 'task',
      environment: new Environment(),
      logger: {},
    };
    const message = {
      fields: {
        routingKey: 'run.execute',
      },
      content: {
        id: 'task1',
      },
      properties: {
        messageId: 'm1',
      },
    };

    const scope = ExecutionScope(activity, message);
    expect(scope).to.have.property('id', 'task1');
    expect(scope).to.have.property('type', 'task');
    expect(scope).to.have.property('logger', activity.logger);
    expect(scope).to.have.property('environment', activity.environment);
    expect(scope).to.have.property('BpmnError', BpmnError);
    expect(scope).to.have.property('ActivityError', ActivityError);
    expect(scope).to.have.property('fields').that.eql({
      routingKey: 'run.execute',
    }).but.not.equal(message.fields);
    expect(scope).to.have.property('content').that.eql({
      id: 'task1',
    }).but.not.equal(message.content);
    expect(scope).to.have.property('properties').that.eql({
      messageId: 'm1',
    }).but.not.equal(message.properties);
  });

  it('exposes resolve expression', () => {
    const activity = {
      id: 'task1',
      type: 'task',
      environment: new Environment({
        variables: {
          input: 1,
        },
      }),
      logger: {},
    };
    const message = {
      fields: {
        routingKey: 'run.execute',
      },
      content: {
        id: 'task1',
      },
      properties: {
        messageId: 'm1',
      },
    };

    const scope = ExecutionScope(activity, message);
    expect(scope.resolveExpression('${logger}')).to.equal(activity.logger);
    expect(scope.resolveExpression('${environment.variables.input}')).to.equal(1);
    expect(scope.resolveExpression('${properties.messageId}')).to.equal('m1');
  });
});
