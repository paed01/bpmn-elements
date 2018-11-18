import {
  // cloneContent,
  // cloneMessage,
  // cloneParent,
  shiftParent,
  unshiftParent
} from '../src/messageHelper';

describe('message helper', () => {
  describe('unshiftParent()', () => {
    it('adds new parent to path', () => {
      const newParent = unshiftParent({id: 1}, {
        id: 2,
        path: [{id: 3}],
      });
      expect(newParent).to.have.property('id', 2);
      expect(newParent).to.have.property('path').with.length(2);
      expect(newParent.path[0]).to.have.property('id', 3);
      expect(newParent.path[1]).to.have.property('id', 1);
    });

    it('defaults to new parent without path', () => {
      const newParent = unshiftParent({id: 1});
      expect(newParent).to.have.property('id', 1);
      expect(newParent).to.not.have.property('path');
    });
  });

  describe('shiftParent()', () => {
    it('sets new new parent and adds current to path', () => {
      const newParent = shiftParent({id: 3}, {
        id: 2,
        path: [{id: 1}],
      });
      expect(newParent).to.have.property('id', 3);
      expect(newParent).to.have.property('path').with.length(2);
      expect(newParent.path[0]).to.have.property('id', 2);
      expect(newParent.path[1]).to.have.property('id', 1);
    });

    it('defaults to new parent without path', () => {
      const newParent = shiftParent({id: 1});
      expect(newParent).to.have.property('id', 1);
      expect(newParent).to.not.have.property('path');
    });
  });
});
