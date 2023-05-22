import * as isoDuration from '../src/iso-duration.js';

describe('ISO Duration', () => {
  describe('parse', () => {
    it('returns object with parsed duration parts', () => {
      expect(isoDuration.parse('P1Y2M3DT4H5M6S')).to.deep.equal({
        years: 1,
        months: 2,
        weeks: 0,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
      });
    });

    it('repeat pattern returns repeat count', () => {
      expect(isoDuration.parse('R3/PT10H')).to.deep.equal({
        days: 0,
        hours: 10,
        minutes: 0,
        months: 0,
        seconds: 0,
        weeks: 0,
        years: 0,
        repeat: 3,
      });

      expect(isoDuration.parse('R3/PT1H')).to.deep.equal({
        days: 0,
        hours: 1,
        minutes: 0,
        months: 0,
        seconds: 0,
        weeks: 0,
        years: 0,
        repeat: 3,
      });

      expect(isoDuration.parse('R0/PT10H')).to.deep.equal({
        days: 0,
        hours: 10,
        minutes: 0,
        months: 0,
        seconds: 0,
        weeks: 0,
        years: 0,
        repeat: 0,
      });
    });

    it('invalid repeat pattern is ignored', () => {
      expect(isoDuration.parse('R/PT10S')).to.deep.equal({
        years: 0,
        months: 0,
        weeks: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 10,
      });
    });

    it('Fractions are allowed on the smallest unit in the string, e.g. P0.5D or PT1.0001S but not PT0.5M0.1S.', () => {
      expect(isoDuration.parse('P0.5D')).to.deep.equal({
        days: 0.5,
        hours: 0,
        minutes: 0,
        months: 0,
        seconds: 0,
        weeks: 0,
        years: 0,
      });

      expect(isoDuration.parse('PT1.0001S')).to.deep.equal({
        days: 0,
        hours: 0,
        minutes: 0,
        months: 0,
        seconds: 1.0001,
        weeks: 0,
        years: 0,
      });

      expect(() => {
        isoDuration.parse('PT0.5M0.1S');
      }).to.throw(RangeError);
    });

    it('invalid duration throws range error', () => {
      expect(() => {
        isoDuration.parse('Last wednesday');
      }).to.throw(RangeError);
    });

    it('repeat only duration throws range error', () => {
      expect(() => {
        isoDuration.parse('R3/');
      }).to.throw(RangeError);

      expect(() => {
        isoDuration.parse('R3/P');
      }).to.throw(RangeError);

      expect(() => {
        isoDuration.parse('R3/PT');
      }).to.throw(RangeError);
    });
  });
});
