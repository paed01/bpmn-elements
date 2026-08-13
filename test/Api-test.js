import { Broker } from 'smqp';
import { Environment } from 'bpmn-elements';
import { ActivityApi } from '../src/Api.js';

describe('Api', () => {
  it('Api without message throws', () => {
    expect(() => {
      // @ts-expect-error message is required
      ActivityApi(new Broker(), null, new Environment());
    }).to.throw(Error);
  });
});
