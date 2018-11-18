import {generateId, brokerSafeId} from '../src/shared';

describe('shared', () => {
  describe('brokerSafeId', () => {
    it('removes whitespace, dots, stars, hashes, and slashes from string', () => {
      expect(brokerSafeId('  my\n\rinput')).to.equal('__my__input');
      expect(brokerSafeId('a.b')).to.equal('a_b');
      expect(brokerSafeId('a.b.c')).to.equal('a_b_c');
      expect(brokerSafeId('a*b')).to.equal('a_b');
      expect(brokerSafeId('a*b*c')).to.equal('a_b_c');
      expect(brokerSafeId('a#b')).to.equal('a_b');
      expect(brokerSafeId('a#b#c')).to.equal('a_b_c');
      expect(brokerSafeId('a/b')).to.equal('a_b');
      expect(brokerSafeId('a/b/c')).to.equal('a_b_c');
      expect(brokerSafeId('a\\b')).to.equal('a_b');
      expect(brokerSafeId('a\\b\\c')).to.equal('a_b_c');
      expect(brokerSafeId('a.b*c#d/e\\f')).to.equal('a_b_c_d_e_f');
    });
  });

  describe('generateId', () => {
    it('generates at least 2000 unique ids', () => {
      const ids = [];
      for (let i = 0; i < 2000; i++) ids.push(generateId());

      expect(ids.filter((a, idx, self) => self.indexOf(a) === idx).length).to.equal(2000);
    });
  });
});
