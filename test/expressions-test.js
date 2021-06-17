import Expressions from '../src/Expressions';

const expressions = Expressions();

describe('Expressions', () => {
  describe('string literals', () => {
    it('should return a string with the value', () => {
      expect(expressions.resolveExpression('test')).to.equal('test');
      expect(expressions.resolveExpression('test', {
        variables: {
          output: 1,
        },
      })).to.equal('test');
    });
  });
  describe('accessing variables', () => {
    it('should extracts variable value', () => {
      expect(expressions.resolveExpression('${variables.input}', {
        variables: {
          input: 1,
        },
      })).to.equal(1);
    });

    it('should return undefined if not found', () => {
      expect(expressions.resolveExpression('${variables.input}', {
        variables: {
          output: 1,
        },
      })).to.be.undefined;
    });

    it('should return undefined for misspelled varailbes', () => {
      expect(expressions.resolveExpression('${varailbes.input}', {
        variables: {
          input: 1,
        },
      })).to.be.undefined;
    });

    it('should return arrays indexed value', () => {
      expect(expressions.resolveExpression('${variables.input[1]}', {
        variables: {
          input: [0, 1],
        },
      })).to.equal(1);
    });

    it('should return arrays negative indexed value', () => {
      expect(expressions.resolveExpression('${variables.input[-2]}', {
        variables: {
          input: [0, 1, 2],
        },
      })).to.equal(1);
    });

    it('should throw an error accessing an array without index', () => {
      expect(() => expressions.resolveExpression('${variables.input[]}', {
        variables: {
          input: [0, 1],
        },
      })).to.throw();
    });

    it('should access string key index', () => {
      expect(expressions.resolveExpression('${variables.input["#complexName"]}', {
        variables: {
          input: {
            '#complexName': 1,
          },
        },
      })).to.equal(1);
    });

    it('should access a variable index', () => {
      expect(expressions.resolveExpression('${variables.input[keyVariable]}', {
        variables: {
          input: {
            'testField': 1,
          }
        },
        keyVariable: 'testField'
      })).to.equal(1);
    });

    it('should access deep property paths', () => {
      expect(expressions.resolveExpression('${variables.input["#complexName"].list[0]}', {
        variables: {
          input: {
            '#complexName': {
              list: [1],
            },
          },
        },
      })).to.equal(1);
    });

    it('should return undefined when access to a field of an undefined object', () => {
      expect(expressions.resolveExpression('${variables.input["#complexName"].list[0]}', {
        variables: {
          input: undefined,
        },
      })).to.be.undefined;
    });

    describe('inline', () => {
      it('should parse variables to string', () => {
        expect(expressions.resolveExpression('PT${variables.input}S', {
          variables: {
            input: 0.1,
          },
        })).to.equal('PT0.1S');
      });

      it('should throw an error if there is an expression inside the expression', () => {
        expect(() => expressions.resolveExpression('PT${variables[${variables.property}]}S', {
          variables: {
            input: 0.1,
            property: 'input',
          },
        })).to.throw();
      });

      it('should evaluate if there is an expression inside the expression properly defined', () => {
        expect(expressions.resolveExpression('${environment.variables[`${environment.commonVariablePrefix}${environment.current}`]}', {
          environment: {
            variables: { a1: 1, a2: 2, a3: 3 },
            commonVariablePrefix: 'a',
            current: 2,
          },
        })).to.equal(2);
      });

      it('should concatenate two variable scapes', () => {
        expect(expressions.resolveExpression('http://${variables.host}${variables.pathname}', {
          variables: {
            host: 'example.com',
            pathname: '/api/v1',
          },
        })).to.equal('http://example.com/api/v1');
      });

      it('should support ternary and logic operations', () => {
        expect(expressions.resolveExpression(
          'http://${variables.host}${variables.pathname || ""}${variables.pathname2 ? variables.pathname2 : ""}',
          {
            variables: {
              host: 'example.com',
              pathname: undefined,
              pathname2: null,
            },
          })).to.equal('http://example.com');
      });
    });
  });

  describe('services', () => {
    it('returns service function', () => {
      expect(expressions.resolveExpression('${services.get}', {
        services: {
          get: () => {
            return 'PT0.1S';
          },
        },
      })()).to.equal('PT0.1S');
    });

    it('should receive the context in empty functions', () => {
      expect(expressions.resolveExpression('${services.get()}', {
        variables: {
          timeout: 'PT0.1S',
        },
        services: {
          get: (message) => {
            return message.variables.timeout;
          },
        },
      })).to.equal('PT0.1S');
    });

    it('service accessing variables returns value', () => {
      expect(expressions.resolveExpression('${services.get({variables})}', {
        variables: {
          timeout: 'PT0.1S',
        },
        services: {
          get: (message) => {
            return message.variables.timeout;
          },
        },
      })).to.equal('PT0.1S');
    });

    it('expression with argument returns value', () => {
      expect(expressions.resolveExpression('${services.get(200)}', {
        services: {
          get: (statusCode) => {
            return statusCode;
          },
        },
      })).to.equal(200);
    });

    it('expression with object argument returns value', () => {
      expect(expressions.resolveExpression('${services.get({a: "test", b: "case"})}', {
        services: {
          get: (obj) => {
            return Object.values(obj).join(' ');
          },
        },
      })).to.equal('test case');
    });

    it('expression with object argument access to a variable and returns value', () => {
      expect(expressions.resolveExpression('${services.get({a, b: "case"})}', {
        a: 'test',
        services: {
          get: (obj) => {
            return Object.values(obj).join(' ');
          },
        },
      })).to.equal('test case');
    });

    it('expression with array argument returns value', () => {
      expect(expressions.resolveExpression('${services.get([1, 2, 3])}', {
        a: 'test',
        services: {
          get: (arr) => {
            return arr;
          },
        },
      })).to.deep.equal([1, 2, 3]);
    });

    it('expression with array argument with a variable inside returns value', () => {
      expect(expressions.resolveExpression('${services.get([1, two, 3])}', {
        two: 2,
        services: {
          get: (arr) => {
            return arr;
          },
        },
      })).to.deep.equal([1, 2, 3]);
    });

    it('expression with empty arguments returns value', () => {
      expect(expressions.resolveExpression('${services.get()}', {
        services: {
          get: () => {
            return '200';
          },
        },
      })).to.equal('200');
    });

    it('expression with argument addressing variables returns value', () => {
      expect(expressions.resolveExpression('${services.get(variables.input[0])}', {
        variables: {
          input: [200],
        },
        services: {
          get: (input) => {
            return input;
          },
        },
      })).to.equal(200);
    });

    it('expression with arguments addressing variables returns value', () => {
      expect(expressions.resolveExpression('${services.get(variables.input[0],variables.add)}', {
        variables: {
          input: [200],
          add: 1,
        },
        services: {
          get: (input, add) => {
            return input + add;
          },
        },
      })).to.equal(201);
    });

    it('expression with string arguments returns result', () => {
      expect(expressions.resolveExpression('${services.get("foo","bar")}', {
        services: {
          get(...args) {
            return args.toString();
          },
        },
      })).to.equal('foo,bar');

      expect(expressions.resolveExpression('${services.get("foo", "bar")}', {
        services: {
          get(...args) {
            return args.toString();
          },
        },
      })).to.equal('foo,bar');

      expect(expressions.resolveExpression('${services.get(  "foo",    "bar")}', {
        services: {
          get(...args) {
            return args.toString();
          },
        },
      })).to.equal('foo,bar');

      expect(expressions.resolveExpression('${services.get(true, "bar")}', {
        services: {
          get(...args) {
            return args;
          },
        },
      })).to.deep.equal([true, 'bar']);

      expect(expressions.resolveExpression('${services.get(  false, "bar")}', {
        services: {
          get(...args) {
            return args;
          },
        },
      })).to.deep.equal([false, 'bar']);

      expect(expressions.resolveExpression('${services.get(null,"bar")}', {
        services: {
          get(...args) {
            return args;
          },
        },
      })).to.deep.equal([null, 'bar']);
    });
  });

  describe('specials', () => {
    it('expression ${null} return null', () => {
      expect(expressions.resolveExpression('${null}')).to.be.null;
    });

    it('expression ${true} return true', () => {
      expect(expressions.resolveExpression('${true}')).to.be.true;
    });

    it('expression ${false} return false', () => {
      expect(expressions.resolveExpression('${false}')).to.be.false;
    });

    it('expression ${0...} return number', () => {
      expect(expressions.resolveExpression('${0}')).to.equal(0);
      expect(expressions.resolveExpression('${1}')).to.equal(1);
      // Octal number
      expect(expressions.resolveExpression('${0o10}')).to.equal(8);
      expect(expressions.resolveExpression('${10.1}')).to.equal(10.1);
    });

    it('should work with lambda functions', () => {
      expect(expressions.resolveExpression('${() => "value"}')()).to.equal('value');
      expect(expressions.resolveExpression('${(test) => test}')(1)).to.equal(1);
    });

    it('should throw an error if you do an unsafe operation', () => {
      expect(() => expressions.resolveExpression('${() => {require("fs").deleteSync(".")}}')).to.throw();
    });

    it('should support multiple lines inside the expression', () => {
      expect(expressions.resolveExpression(`\${
        (value) => {
          return value;
        }}`)(1)).to.equal(1);
    });
  });
});
