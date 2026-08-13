import { BpmnError as BpmnErrorActivity, Environment } from 'bpmn-elements';

describe('BpmnError', () => {
  it('returns BpmnError instanceof from error', () => {
    const bpmnError = BpmnErrorActivity(
      /** @type {any} */ ({
        id: 'Error_0',
        name: 'TestError',
      }),
      /** @type {any} */ ({ environment: new Environment() })
    );

    const err = bpmnError.resolve(/** @type {any} */ ({}), new Error('Men'));

    expect(err).to.have.property('id', 'Error_0');
    expect(err).to.have.property('name', 'TestError');
  });

  it('resolves errorCode expression', () => {
    const bpmnError = BpmnErrorActivity(
      /** @type {any} */ ({
        id: 'Error_0',
        name: 'TestError',
        behaviour: {
          errorCode: 'EMES',
        },
      }),
      /** @type {any} */ ({ environment: new Environment() })
    );

    const err = bpmnError.resolve(
      /** @type {any} */ ({
        resolveExpression(errorCode) {
          return errorCode;
        },
      }),
      new Error('Men')
    );

    expect(err).to.have.property('code', 'EMES');
  });
});
