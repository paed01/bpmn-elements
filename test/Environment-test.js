import Environment from '../src/Environment';
import {Timers} from '../src/Timers';

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

    it('keeps extensions', () => {
      const extensions = {extendo() {}};
      let environment = Environment({
        extensions,
        settings: {
          enableDummyService: false,
        },
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
      expect(environment.extensions).to.have.property('extendo').that.is.a('function');
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

    it('recovers variables only', () => {
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

      environment = environment.recover({
        variables: {beforeState: false},
      });

      expect(environment.variables).to.have.property('beforeState', false);
    });

    it('recovers with empty object', () => {
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

      environment = environment.recover({});

      expect(environment.variables).to.have.property('beforeState', true);
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
    it('clones variables, settings, output, and options but keeps services, scripts, expressions, timers, and Logger', () => {
      const variables = {
        init: true,
      };
      const settings = {
        init: true,
      };
      const listener = {
        emit() {}
      };
      const expressions = {};
      const environment = Environment({
        listener,
        settings,
        variables,
        expressions,
        timers: {
          register() {},
          setTimeout() {},
          clearTimeout() {},
        },
        services: {
          get() {},
        },
        Logger() {},
      });

      expect(environment.options).to.have.property('listener', listener);

      const clone = environment.clone();
      expect(environment.variables.init).to.be.true;
      clone.variables.init = false;
      clone.settings.init = false;

      expect(environment.variables.init).to.be.true;
      expect(environment.settings.init).to.be.true;
      expect(clone.options).to.have.property('listener', listener);

      expect(clone.getServiceByName('get')).to.be.a('function');
      expect(clone.Logger).to.be.a('function');
      expect(clone.scripts === environment.scripts, 'keeps scripts').to.be.true;
      expect(clone.timers === environment.timers, 'keeps timers').to.be.true;
      expect(clone.expressions === environment.expressions, 'keeps expressions').to.be.true;
    });

    it('extends options', () => {
      const environment = Environment({
        listener: {},
      });

      expect(environment.options).to.have.property('listener');
      const clone = environment.clone({myOption: 1});
      expect(clone.options).to.have.property('listener');
      expect(clone.options).to.have.property('myOption', 1);
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

    it('allows override of scripts', () => {
      const environment = Environment({
        scripts: {
          register() {},
          getScript() {},
        }
      });

      const myScripts = {
        register() {},
        getScript() {},
      };
      const clone = environment.clone({scripts: myScripts});

      expect(clone.scripts).to.be.ok.and.an('object').that.equal(myScripts);
    });

    it('allows override of expressions', () => {
      const expressions = {};
      const environment = Environment({
        expressions
      });

      const newExpressions = {};
      const clone = environment.clone({expressions: newExpressions});

      expect(clone.expressions).to.be.ok.and.an('object').that.equal(newExpressions);
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

  describe('expressions', () => {
    it('resolveExpression() resolves expression', () => {
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
          get() {
            return true;
          },
        },
        Logger() {},
      });

      expect(environment.resolveExpression('${environment.settings.init}')).to.be.true;
      expect(environment.resolveExpression('${environment.variables.init}')).to.be.true;
      expect(environment.resolveExpression('${environment.services.get}')).to.be.a('function');
      expect(environment.resolveExpression('${environment.services.get()}')).to.be.true;
    });

    it('resolveExpression() with overridden expressions', () => {
      const variables = {
        init: true,
      };
      const settings = {
        init: true,
      };
      const expressions = {
        resolveExpression(...args) {
          return args;
        },
      };
      const environment = Environment({
        settings,
        variables,
        expressions,
        services: {
          get() {
            return true;
          },
        },
        Logger() {},
      });

      expect(environment.resolveExpression('${environment.settings.init}')).to.eql([
        '${environment.settings.init}',
        {environment},
      ]);
    });
  });

  describe('timers', () => {
    it('timers.setTimeout adds timer to executing', () => {
      const {timers} = Environment({
        timers: Timers({
          setTimeout() {},
        })
      });

      timers.setTimeout(() => {}, 11);

      expect(timers.executing).to.have.length(1);
      expect(timers.executing[0]).to.have.property('delay', 11);
      expect(timers.executing[0].owner === timers, 'timers instance as owner').to.be.true;
    });

    it('removes timer from executing when timed out', () => {
      let onTimeout;
      const {timers} = Environment({
        timers: Timers({
          setTimeout(callback) {
            onTimeout = callback;
          },
        })
      });

      timers.setTimeout(() => {}, 11);

      expect(timers.executing).to.have.length(1);

      onTimeout();

      expect(timers.executing).to.have.length(0);
    });

    it('callback called twice is ignored', () => {
      let onTimeout;
      const {timers} = Environment({
        timers: Timers({
          setTimeout(callback) {
            onTimeout = callback;
          },
        })
      });

      timers.setTimeout(() => {}, 11);

      expect(timers.executing).to.have.length(1);

      onTimeout();
      onTimeout();

      expect(timers.executing).to.have.length(0);
    });

    it('timers.clearTimeout removes timer from executing', () => {
      const {timers} = Environment({
        timers: Timers({
          setTimeout() {},
          clearTimeout() {},
        })
      });

      const ref = timers.setTimeout(() => {}, 12);

      expect(timers.executing).to.have.length(1);

      timers.clearTimeout(ref);

      expect(timers.executing).to.have.length(0);
    });

    it('timers.clearTimeout can be called twice', () => {
      const {timers} = Environment({
        timers: Timers({
          setTimeout() {},
          clearTimeout() {},
        })
      });

      const ref = timers.setTimeout(() => {}, 12);

      expect(timers.executing).to.have.length(1);

      timers.clearTimeout(ref);
      timers.clearTimeout(ref);

      expect(timers.executing).to.have.length(0);
    });

    describe('.register(owner)', () => {
      it('.register(owner) returns timers', () => {
        const environment = Environment();

        const timer = environment.timers.register({id: 'a'});

        expect(timer).to.have.property('setTimeout').that.is.a('function');
        expect(timer).to.have.property('clearTimeout').that.is.a('function');
      });

      it('.register() returns timers', () => {
        const environment = Environment();

        const timer = environment.timers.register();

        expect(timer).to.have.property('setTimeout').that.is.a('function');
        expect(timer).to.have.property('clearTimeout').that.is.a('function');
      });

      it('registered executes timer function with owner', (done) => {
        const owner = {id: 'a'};

        const {timers} = Environment({
          timers: Timers({
            setTimeout: function fakeSetTimeout() {
              expect(this === owner).to.be.true;
              done();
            },
          })
        });

        const timer = timers.register(owner);

        timer.setTimeout();
      });

      it('setTimeout adds timer to executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);

        timer.setTimeout(() => {}, 10);

        expect(timers.executing).to.have.length(1);
        expect(timers.executing[0]).to.have.property('delay', 10);
        expect(timers.executing[0].owner === owner, 'owner as owner').to.be.true;
      });

      it('registered executes timer function with owner', (done) => {
        const owner = {id: 'a'};

        const {timers} = Environment({
          timers: Timers({
            setTimeout: function fakeSetTimeout() {
              expect(this === owner).to.be.true;
              done();
            },
          })
        });

        const timer = timers.register(owner);

        timer.setTimeout();
      });

      it('setTimeout adds timer to executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);

        timer.setTimeout(() => {}, 10);

        expect(timers.executing).to.have.length(1);
        expect(timers.executing[0]).to.have.property('delay', 10);
        expect(timers.executing[0].owner === owner, 'owner as owner').to.be.true;
      });

      it('multiple setTimeout adds timers to executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);

        timer.setTimeout(() => {}, 20);
        timer.setTimeout(() => {}, 21);
        timer.setTimeout(() => {}, 22);

        expect(timers.executing).to.have.length(3);
        expect(timers.executing[0]).to.have.property('delay', 20);
        expect(timers.executing[0].owner === owner, 'owner as owner').to.be.true;
        expect(timers.executing[1]).to.have.property('delay', 21);
        expect(timers.executing[1].owner === owner, 'owner as owner').to.be.true;
        expect(timers.executing[2]).to.have.property('delay', 22);
        expect(timers.executing[2].owner === owner, 'owner as owner').to.be.true;
      });

      it('clearTimeout removes timer from executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
            clearTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);
        const ref = timer.setTimeout(() => {}, 12);

        expect(timers.executing).to.have.length(1);

        timer.clearTimeout(ref);

        expect(timers.executing).to.have.length(0);
      });

      it('clearTimeout removes only ref from executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);

        timer.setTimeout(() => {}, 20);
        const ref = timer.setTimeout(() => {}, 21);
        timer.setTimeout(() => {}, 22);

        timer.clearTimeout(ref);

        expect(timers.executing).to.have.length(2);
        expect(timers.executing[0]).to.have.property('delay', 20);
        expect(timers.executing[1]).to.have.property('delay', 22);
      });

      it('timers.clearTimeout removes registered timer from executing', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
            clearTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);
        const ref = timer.setTimeout(() => {}, 12);

        expect(timers.executing).to.have.length(1);

        timers.clearTimeout(ref);

        expect(timers.executing).to.have.length(0);
      });

      it('clearTimeout can be called twice', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
            clearTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);
        const ref = timer.setTimeout(() => {}, 12);

        expect(timers.executing).to.have.length(1);

        timer.clearTimeout(ref);
        timer.clearTimeout(ref);

        expect(timers.executing).to.have.length(0);
      });

      it('clearTimeout can be called with unknown ref', () => {
        const {timers} = Environment({
          timers: Timers({
            setTimeout() {},
            clearTimeout() {},
          })
        });

        const owner = {id: 'a'};
        const timer = timers.register(owner);
        timer.setTimeout(() => {}, 12);

        expect(timers.executing).to.have.length(1);

        timer.clearTimeout({});

        expect(timers.executing).to.have.length(1);
      });
    });

    describe('custom timer', () => {
      it('throws if interface not met', () => {
        expect(() => {
          Environment({timers: {}});
        }).to.throw(/register is not a function/);

        expect(() => {
          Environment({timers: {register: 1}});
        }).to.throw(/register is not a function/);

        expect(() => {
          Environment({
            timers: {
              register() {},
            }
          });
        }).to.throw(/setTimeout is not a function/);

        expect(() => {
          Environment({
            timers: {
              register() {},
              setTimeout() {},
            }
          });
        }).to.throw(/clearTimeout is not a function/);
      });
    });
  });
});
