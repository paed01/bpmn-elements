import {filterUndefined} from '../src/shared';

import {
  shiftParent,
  unshiftParent,
  pushParent,
} from '../src/messageHelper';

describe('message helper', () => {
  describe('unshiftParent()', () => {
    it('adds new parent and pushes current to path', () => {
      expect(filterUndefined(unshiftParent({
        id: 'parent',
        executionId: 'parent_0',
        type: 'ancestor',
      }, {
        id: 'child',
      }))).to.eql({
        id: 'child',
        path: [{
          id: 'parent',
          executionId: 'parent_0',
          type: 'ancestor',
        }],
      });

      expect(filterUndefined(unshiftParent({
        id: 'child',
        executionId: 'child_0',
        type: 'sister',
        path: [{
          id: 'parent',
        }, {
          id: 'grandma',
        }],
      }, {
        id: 'nephew',
        executionId: 'me_0',
        type: 'task',
      }))).to.deep.include({
        id: 'nephew',
        executionId: 'me_0',
        type: 'task',
        path: [{
          id: 'child',
          executionId: 'child_0',
          type: 'sister',
        }, {
          id: 'parent',
        }, {
          id: 'grandma',
        }],
      });
    });

    it('only adds id, type, and executionId from new parent', () => {
      const newParent = unshiftParent({
        id: 1,
        executionId: '1_0',
        type: 'task',
        path: [{id: 3}],
      }, {
        id: 2,
        executionId: '2_0',
        type: 'task',
        list: [],
        parent: {},
      });
      expect(newParent).to.eql({
        id: 2,
        executionId: '2_0',
        type: 'task',
        path: [{
          id: 1,
          executionId: '1_0',
          type: 'task',
        }, {
          id: 3,
        }],
      });
    });

    it('return new parent if no current parent', () => {
      const newParent = unshiftParent(undefined, {
        id: 1,
        executionId: '1_0',
        type: 'task',
      });
      expect(newParent).to.eql({
        id: 1,
        executionId: '1_0',
        type: 'task',
      });
    });
  });

  describe('shiftParent()', () => {
    it('replaces parent with first from path', () => {
      expect(filterUndefined(shiftParent({
        id: 'child',
        path: [{id: 'parent'}],
      }))).to.eql({
        id: 'parent',
      });

      expect(filterUndefined(shiftParent({
        id: 'child',
        path: [{id: 'parent'}, {id: 'grandpa'}],
      }))).to.deep.include({
        id: 'parent',
        path: [{id: 'grandpa'}],
      });
    });

    it('returns undefined if no parent parent path', () => {
      expect(shiftParent({})).to.be.undefined;
    });

    it('returns undefined if empty parent path', () => {
      expect(shiftParent({path: []})).to.be.undefined;
    });

    it('returns undefined if no parent', () => {
      expect(shiftParent()).to.be.undefined;
    });
  });

  describe('pushParent()', () => {
    it('pushes parent to path', () => {
      expect(filterUndefined(pushParent({
        id: 'parent',
        executionId: 'parent_0',
        type: 'ancestor',
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'parent',
        executionId: 'parent_0',
        type: 'ancestor',
        path: [{
          id: 'process1',
          type: 'process',
          executionId: 'process1_0',
        }],
      });

      expect(filterUndefined(pushParent({
        id: 'child',
        executionId: 'child_0',
        type: 'task',
        path: [{
          id: 'parent',
        }],
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.deep.include({
        id: 'child',
        executionId: 'child_0',
        type: 'task',
        path: [{
          id: 'parent',
        }, {
          id: 'process1',
          type: 'process',
          executionId: 'process1_0',
        }],
      });

      expect(filterUndefined(pushParent({
        id: 'child',
        type: 'task',
        executionId: 'child_0',
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'child',
        type: 'task',
        executionId: 'child_0',
        path: [{
          id: 'process1',
          type: 'process',
          executionId: 'process1_0',
        }],
      });
    });

    it('updates executionId if parent id is already in path', () => {
      expect(filterUndefined(pushParent({
        id: 'parent',
        executionId: 'parent_0',
        type: 'ancestor',
        path: [{id: 'process1'}],
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'parent',
        executionId: 'parent_0',
        type: 'ancestor',
        path: [{
          id: 'process1',
          executionId: 'process1_0',
        }],
      });
    });

    it('updates executionId if parent id is the same', () => {
      expect(filterUndefined(pushParent({
        id: 'process1',
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'process1',
        executionId: 'process1_0',
      });
    });

    it('sets ancestor as parent if no parent', () => {
      expect(filterUndefined(pushParent(undefined, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      });
    });

    it('updates ancestor as parent if parent is the same', () => {
      expect(filterUndefined(pushParent({
        id: 'process1',
        type: 'process',
      }, {
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      }))).to.eql({
        id: 'process1',
        type: 'process',
        executionId: 'process1_0',
      });
    });
  });
});
