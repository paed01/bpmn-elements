import * as api from '../src/index.js';
import * as isoDuration from '../src/iso-duration.js';

describe('bpmn-elemements module', () => {
  it('exports Timers', () => {
    expect(api).to.have.property('Timers').that.is.a('function');
  });

  it('exports ISODuration', () => {
    expect(api).to.have.property('ISODuration');
    expect(api.ISODuration).to.equal(isoDuration);
  });
});
