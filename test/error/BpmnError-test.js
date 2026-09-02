import { BpmnError as BpmnErrorActivity } from 'bpmn-elements';
import testHelpers from '../helpers/testHelpers.js';

describe('BpmnError', () => {
  it('returns BpmnError instanceof from error', () => {
    const bpmnError = BpmnErrorActivity(
      {
        id: 'Error_0',
        name: 'TestError',
      },
      testHelpers.emptyContext()
    );

    // @ts-expect-error type coverage
    const err = bpmnError.resolve({}, new Error('Men'));

    expect(err).to.have.property('id', 'Error_0');
    expect(err).to.have.property('name', 'TestError');
  });

  it('resolves errorCode expression', () => {
    const bpmnError = BpmnErrorActivity(
      {
        id: 'Error_0',
        name: 'TestError',
        behaviour: {
          errorCode: 'EMES',
        },
      },
      testHelpers.emptyContext()
    );

    const err = bpmnError.resolve(
      {
        // @ts-expect-error type coverage
        resolveExpression(errorCode) {
          return errorCode;
        },
      },
      new Error('Men')
    );

    expect(err).to.have.property('code', 'EMES');
  });
});
