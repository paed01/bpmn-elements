import * as ck from 'chronokinesis';

import { Timers } from '../src/Timers.js';

describe('Timers', () => {
  describe('setTimeout', () => {
    afterEach(ck.reset);

    it('returns home baked timer object', () => {
      ck.freeze('2023-05-25T10:00Z');
      const timers = new Timers({
        setTimeout() {
          return 'ref';
        },
        clearTimeout() {},
      });

      const callback = () => {};
      const timer = timers.setTimeout(callback, 60000, 1);

      expect(timer.callback).to.equal(callback);
      expect(timer.delay).to.equal(60000);
      expect(timer.args).to.deep.equal([1]);
      expect(timer.owner).to.be.null;
      expect(timer.timerId).to.be.a('string');
      expect(timer.expireAt).to.deep.equal(new Date('2023-05-25T10:01Z'));
      expect(timer.timerRef).to.equal('ref');
    });

    it('adds timer to list of executing timers', () => {
      const timers = new Timers({
        setTimeout() {
          return 'ref';
        },
        clearTimeout() {},
      });

      const callback = () => {};
      const timer = timers.setTimeout(callback, 60000, 1);

      expect(timers.executing).to.have.length(1);
      expect(timers.executing[0].timerId).to.be.ok.and.equal(timer.timerId);
    });
  });

  describe('clearTimeout', () => {
    it('resets timerRef on timer', () => {
      const timers = new Timers({
        setTimeout() {
          return 'ref';
        },
        clearTimeout() {},
      });

      const timer = timers.setTimeout(() => {}, 100);

      expect(timer.timerRef).to.equal('ref');

      timers.clearTimeout(timer);

      expect(timer.timerRef).to.be.undefined;
    });
  });
});
