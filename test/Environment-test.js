import Environment from '../src/Environment';

describe('Environment', () => {
  describe('ctor', () => {
    it('sets settings', () => {
      expect(Environment()).to.have.property('settings').that.eql({});
      expect(Environment({settings: {
        test: 1,
      }})).to.have.property('settings').that.eql({
        test: 1,
      });
    });

    it('shallow clones settings', () => {
      const settings = {
        test: 1,
      };

      const environment = Environment({settings});

      settings.test = 2;

      expect(environment).to.have.property('settings').that.eql({
        test: 1,
      });
    });

    it('throws if scripts interface validation is not met', () => {
      expect(() => {
        Environment({
          scripts: {}
        });
      }).to.throw(/scripts.register is not a function/);
      expect(() => {
        Environment({
          scripts: {register: {}}
        });
      }).to.throw(/scripts.register is not a function/);
      expect(() => {
        Environment({
          scripts: {register() {}}
        });
      }).to.throw(/scripts.getScript is not a function/);
      expect(() => {
        Environment({
          scripts: {register() {}, getScript: 1}
        });
      }).to.throw(/scripts.getScript is not a function/);
    });

    it('throws if extensions interface validation is not met', () => {
      expect(() => {
        Environment({
          extensions: 1
        });
      }).to.throw(/extensions is not an object/);
      expect(() => {
        Environment({
          extensions: {
            js: {}
          }
        });
      }).to.throw(/extensions\[js\] is not a function/);
    });
  });

  describe('getServiceByName()', () => {
    it('returns service function', () => {
      const environment = Environment({
        services: {
          get() {},
        },
      });

      const service = environment.getServiceByName('get');

      expect(service).to.be.a('function');
    });

    it('returns undefined if service is not found', () => {
      const environment = Environment();
      const service = environment.getServiceByName('put');
      expect(service).to.be.undefined;
    });
  });

  describe('getState()', () => {
    it('returns settings, variables, and output', () => {
      const environment = Environment({
        settings: {
          test: 0,
        },
        variables: {
          init: 1,
          loadedAt: new Date(),
          myArray: [1, 2, 3, 5],
        },
        services: {
          myFuncs() {},
          request() {},
        },
      });

      const state = environment.getState();

      expect(Object.keys(state)).to.have.same.members(['output', 'settings', 'variables']);

      expect(Object.keys(state.variables)).to.have.same.members(['init', 'loadedAt', 'myArray']);
    });
  });

  describe('recover()', () => {
    it('sets options, variables, and output', () => {
      const extensions = {};
      let environment = Environment({
        extensions,
        variables: {
          beforeState: true,
        },
        services: {
          request() {},
        },
      });

      environment = environment.recover({
        variables: {
          init: 1,
          loadedAt: new Date(),
          myArray: [1, 2, 3, 5],
        },
      });

      expect(environment.extensions).to.equal(extensions);

      expect(environment.variables.init).to.equal(1);
      expect(environment.variables.beforeState).to.be.true;
      expect(environment.getServiceByName('request')).to.be.a('function');
      expect(environment.resolveExpression('${environment.variables.myArray[-1]}')).to.equal(5);
    });

    it('recovers without state', () => {
      const extensions = {};
      let environment = Environment({
        extensions,
        services: {
          request() {},
        },
        variables: {
          beforeState: true,
        },
      });

      environment = environment.recover();

      expect(environment.extensions).to.equal(extensions);
      expect(environment.getServiceByName('request')).to.be.a('function');
    });
  });

  describe('assignVariables()', () => {
    it('assigns new variables', () => {
      const environment = Environment({variables: {before: true, init: 0}});

      environment.assignVariables({
        init: 1,
      });

      expect(environment.variables.init).to.equal(1);
      expect(environment.variables.before).to.be.true;
    });

    it('ignored if non-object is passed', () => {
      const environment = Environment({variables: {before: true}});
      environment.assignVariables();
      expect(environment.variables).to.eql({before: true});
      environment.assignVariables(null);
      expect(environment.variables).to.eql({before: true});
      environment.assignVariables('null');
      expect(environment.variables).to.eql({before: true});
      environment.assignVariables(1);
      expect(environment.variables).to.eql({before: true});
    });
  });

  describe('clone()', () => {
    it('clones variables and settings but keeps services, scripts and Logger', () => {
      const variables = {
        init: true,
      };
      const settings = {
        init: true,
      };
      const environment = Environment({
        settings,
        variables,
        services: {
          get() {},
        },
        Logger() {},
        Script() {},
      });

      const clone = environment.clone();
      expect(environment.variables.init).to.be.true;
      clone.variables.init = false;
      clone.settings.init = false;

      expect(environment.variables.init).to.be.true;
      expect(environment.settings.init).to.be.true;
      expect(clone.getServiceByName('get')).to.be.a('function');
      expect(clone.Logger).to.be.a('function');
      expect(clone.scripts === environment.scripts).to.be.true;
    });

    it('allows override of output and variables', () => {
      const variables = {
        init: true,
      };
      const output = {};
      const environment = Environment({
        variables,
        output,
      });

      const clone = environment.clone();
      expect(environment.variables.init).to.be.true;
      clone.variables.init = false;
      expect(environment.variables.init).to.be.true;

      expect(clone.output).to.be.ok.and.an('object').that.is.not.equal(output);
    });

    it('extends services', () => {
      const environment = Environment({
        variables: {init: true},
        output: {},
        services: {
          initSvc1() {},
          initSvc2() {},
        },
      });

      const clone = environment.clone({
        services: {
          cloneSvc() {},
          initSvc2() {},
        },
      });

      expect(clone.services).to.have.property('initSvc1').that.is.a('function');
      expect(clone.services).to.have.property('cloneSvc').that.is.a('function');
      expect(clone.services).to.have.property('initSvc2').that.is.a('function').that.is.not.equal(environment.services.initSvc2);
    });
  });
});
