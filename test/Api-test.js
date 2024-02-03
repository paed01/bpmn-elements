import { Broker } from 'smqp';
import { ActivityApi } from '../src/Api.js';
import Environment from '../src/Environment.js';

describe('Api', () => {
  it('Api without message throws', () => {
    expect(() => {
      ActivityApi(new Broker(), null, new Environment());
    }).to.throw(Error);
  });
});
