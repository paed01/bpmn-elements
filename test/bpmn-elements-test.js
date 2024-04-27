import * as api from '../src/index.js';

describe('bpmn-elemements module', () => {
  it('exports Timers', () => {
    expect(api).to.have.property('Timers').that.is.a('function');
  });

  it('exports Errors', () => {
    expect(api).to.have.property('ActivityError').that.is.a('function');
    expect(api).to.have.property('RunError').that.is.a('function');
  });
});
