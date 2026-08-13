import { AdHocSubProcessBehaviour } from '../../src/tasks/AdHocSubProcess.js';

function createBehaviour(behaviour) {
  const activity = {
    id: 'adhoc',
    type: 'bpmn:AdHocSubProcess',
    behaviour,
    environment: {},
    broker: {},
  };
  return new AdHocSubProcessBehaviour(/** @type {any} */ (activity), /** @type {any} */ ({}));
}

describe('AdHocSubProcessBehaviour', () => {
  describe('completionCondition', () => {
    it('is taken verbatim when given as a string expression', () => {
      const behaviour = createBehaviour({ completionCondition: '${content.output.done}' });
      expect(behaviour.completionCondition).to.equal('${content.output.done}');
    });

    it('reads the body when given as a formal expression object', () => {
      const behaviour = createBehaviour({ completionCondition: { body: '${content.output.done}' } });
      expect(behaviour.completionCondition).to.equal('${content.output.done}');
    });

    it('is undefined when absent', () => {
      const behaviour = createBehaviour({});
      expect(behaviour.completionCondition).to.be.undefined;
    });
  });
});
