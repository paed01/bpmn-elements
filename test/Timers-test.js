import * as ck from 'chronokinesis';
import * as nodeTimers from 'node:timers';
import { Timers } from 'bpmn-elements';

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

  describe('options', () => {
    it('accepts any setTimeout and clearTimeout function', () => {
      /** @type {{delay: number, args: any[]}[]} */
      const calls = [];
      const timers = new Timers({
        setTimeout(_callback, delay, ...args) {
          calls.push({ delay, args });
          return calls.length;
        },
        clearTimeout() {
          calls.pop();
        },
      });

      const timer = timers.setTimeout(() => {}, 60000, 1);

      expect(calls).to.have.length(1);
      expect(calls[0]).to.deep.equal({ delay: 60000, args: [1] });

      timers.clearTimeout(timer);

      expect(calls).to.have.length(0);
    });

    it('accepts builtin timers module', () => {
      const timers = new Timers(nodeTimers);

      const timer = timers.setTimeout(() => {}, 60000);

      expect(timer.timerRef).to.be.ok;

      timers.clearTimeout(timer);
    });

    it('accepts builtin setTimeout and clearTimeout', () => {
      const timers = new Timers({ setTimeout, clearTimeout });

      const timer = timers.setTimeout(() => {}, 60000);

      expect(timer.timerRef).to.be.ok;

      timers.clearTimeout(timer);
    });
  });
});
