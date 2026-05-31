import { Broker } from 'smqp';
import { Environment } from 'bpmn-elements';
import { ActivityApi } from '../src/Api.js';
describe('Api', () => {
  it('Api without message throws', () => {
    expect(() => {
      ActivityApi(new Broker(), null, new Environment());
    }).to.throw(Error);
  });
});
