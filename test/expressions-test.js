import Expressions from '../src/Expressions.js';
import { resolveExpression } from '@aircall/expression-parser';

const expressions = Expressions();
const aircall = { resolveExpression };

describe('Expressions', () => {
  [expressions, aircall].forEach((parser) => {
    describe('#resolveExpression' + (parser !== expressions ? ' using @aircall/expression-parser' : ''), () => {
      describe('addressing variables', () => {
        it('extracts variable value', () => {
          expect(
            parser.resolveExpression('${variables.input}', {
              variables: {
                input: 1,
              },
            }),
          ).to.equal(1);
        });

        it('returns undefined if not found', () => {
          expect(
            parser.resolveExpression('${variables.input}', {
              variables: {
                output: 1,
              },
            }),
          ).to.be.undefined;
        });

        it('misspelled varailbes returns undefined', () => {
          expect(
            parser.resolveExpression('${varailbes.input}', {
              variables: {
                input: 1,
              },
            }),
          ).to.be.undefined;
        });

        it('addressing arrays returns value', () => {
          expect(
            parser.resolveExpression('${variables.input[1]}', {
              variables: {
                input: [0, 1],
              },
            }),
          ).to.equal(1);
        });

        describe('inline', () => {
          it('variables in string', () => {
            expect(
              parser.resolveExpression('PT${variables.input}S', {
                variables: {
                  input: 0.1,
                },
              }),
            ).to.equal('PT0.1S');
          });

          it('combined', () => {
            expect(
              parser.resolveExpression('http://${variables.host}${variables.pathname}', {
                variables: {
                  host: 'example.com',
                  pathname: '/api/v1',
                },
              }),
            ).to.equal('http://example.com/api/v1');
          });
        });
      });

      describe('services', () => {
        it('returns service function', () => {
          expect(
            parser.resolveExpression('${services.get}', {
              services: {
                get: () => {
                  return 'PT0.1S';
                },
              },
            })(),
          ).to.equal('PT0.1S');
        });

        it('service accessing variables returns value', () => {
          expect(
            parser.resolveExpression('${services.get()}', {
              variables: {
                timeout: 'PT0.1S',
              },
              services: {
                get: (message) => {
                  return message.variables.timeout;
                },
              },
            }),
          ).to.equal('PT0.1S');
        });

        it('expression with argument returns value', () => {
          expect(
            parser.resolveExpression('${services.get(200)}', {
              services: {
                get: (statusCode) => {
                  return statusCode;
                },
              },
            }),
          ).to.equal(200);
        });

        it('expression with empty arguments returns value', () => {
          expect(
            parser.resolveExpression('${services.get()}', {
              services: {
                get: () => {
                  return '200';
                },
              },
            }),
          ).to.equal('200');
        });

        it('expression with argument adressing variables returns value', () => {
          expect(
            parser.resolveExpression('${services.get(variables.input[0])}', {
              variables: {
                input: [200],
              },
              services: {
                get: (input) => {
                  return input;
                },
              },
            }),
          ).to.equal(200);
        });

        it('expression with arguments adressing variables returns value', () => {
          expect(
            parser.resolveExpression('${services.get(variables.input[0],variables.add)}', {
              variables: {
                input: [200],
                add: 1,
              },
              services: {
                get: (input, add) => {
                  return input + add;
                },
              },
            }),
          ).to.equal(201);
        });

        it('expression with string arguments returns result', () => {
          expect(
            parser.resolveExpression('${services.get("foo","bar")}', {
              services: {
                get(...args) {
                  return args.toString();
                },
              },
            }),
          ).to.equal('foo,bar');

          expect(
            parser.resolveExpression('${services.get("foo", "bar")}', {
              services: {
                get(...args) {
                  return args.toString();
                },
              },
            }),
          ).to.equal('foo,bar');

          expect(
            parser.resolveExpression('${services.get(  "foo",    "bar")}', {
              services: {
                get(...args) {
                  return args.toString();
                },
              },
            }),
          ).to.equal('foo,bar');

          expect(
            parser.resolveExpression('${services.get(true, "bar")}', {
              services: {
                get(...args) {
                  return args;
                },
              },
            }),
          ).to.deep.equal([true, 'bar']);

          expect(
            parser.resolveExpression('${services.get(  false, "bar")}', {
              services: {
                get(...args) {
                  return args;
                },
              },
            }),
          ).to.deep.equal([false, 'bar']);

          expect(
            parser.resolveExpression('${services.get(null,"bar")}', {
              services: {
                get(...args) {
                  return args;
                },
              },
            }),
          ).to.deep.equal([null, 'bar']);
        });
      });

      describe('specials', () => {
        it('expression ${null} return null', () => {
          expect(parser.resolveExpression('${null}')).to.be.null;
        });

        it('expression ${true} return true', () => {
          expect(parser.resolveExpression('${true}')).to.be.true;
        });

        it('expression ${false} return false', () => {
          expect(parser.resolveExpression('${false}')).to.be.false;
        });

        it('expression ${n} return number', () => {
          expect(parser.resolveExpression('${0}')).to.equal(0);
          expect(parser.resolveExpression('${1}')).to.equal(1);
        });
      });
    });
  });

  describe('Standard #resolveExpression', () => {
    it('addressing array without index returns undefined', () => {
      expect(
        expressions.resolveExpression('${variables.input[]}', {
          variables: {
            input: [0, 1],
          },
        }),
      ).to.be.undefined;
    });

    it('addressing named property returns value', () => {
      expect(
        expressions.resolveExpression('${variables.input[#complexName]}', {
          variables: {
            input: {
              '#complexName': 1,
            },
          },
        }),
      ).to.equal(1);
    });

    it('deep property path returns value', () => {
      expect(
        expressions.resolveExpression('${variables.input[#complexName].list[0]}', {
          variables: {
            input: {
              '#complexName': {
                list: [1],
              },
            },
          },
        }),
      ).to.equal(1);
    });

    it('inserts nothing if variable is found but undefined', () => {
      expect(
        expressions.resolveExpression('http://${variables.host}${variables.pathname}', {
          variables: {
            host: 'example.com',
            pathname: undefined,
          },
        }),
      ).to.equal('http://example.com');
    });

    it('expression ${01...} return number', () => {
      expect(expressions.resolveExpression('${010}')).to.equal(10);
      expect(expressions.resolveExpression('${010.1}')).to.equal(10.1);
      expect(expressions.resolveExpression('${010,1}')).to.be.undefined;
    });

    it('expression in expression is not supported and returns weird value', () => {
      expect(
        expressions.resolveExpression('PT${variables[${variables.property}]}S', {
          variables: {
            input: 0.1,
            property: 'input',
          },
        }),
      ).to.equal('PT]}S');
    });
  });

  describe('isExpression(text)', () => {
    it('returns true if expression', () => {
      expect(expressions.isExpression('${input}')).to.be.true;
      expect(expressions.isExpression('${variables.input[#complexName].list[0]}')).to.be.true;
      expect(expressions.isExpression('${services.get()}')).to.be.true;
    });

    it('returns false if the string is not an explicit expression', () => {
      expect(expressions.isExpression('return `${input}`;')).to.be.false;
      expect(expressions.isExpression('`${input}`;')).to.be.false;
      expect(expressions.isExpression('`${input}`')).to.be.false;
    });

    it('returns false if not expression', () => {
      expect(expressions.isExpression('{input}')).to.be.false;
    });

    it('returns false if empty expression', () => {
      expect(expressions.isExpression('${}')).to.be.false;
    });

    it('returns false if no argument is passed', () => {
      expect(expressions.isExpression()).to.be.false;
    });
  });

  describe('hasExpression(text)', () => {
    it('returns true if expression', () => {
      expect(expressions.hasExpression('${input}')).to.be.true;
      expect(expressions.hasExpression('${variables.input[#complexName].list[0]}')).to.be.true;
      expect(expressions.hasExpression('${services.get()}')).to.be.true;
    });

    it('returns true if the string is not an explicit expression', () => {
      expect(expressions.hasExpression('return `${input}`;')).to.be.true;
      expect(expressions.hasExpression('`${input}`;')).to.be.true;
      expect(expressions.hasExpression('`${input}`')).to.be.true;
    });

    it('returns false if not expression', () => {
      expect(expressions.hasExpression('{input}')).to.be.false;
    });

    it('returns false if empty expression', () => {
      expect(expressions.hasExpression('${}')).to.be.false;
    });

    it('returns false if no argument is passed', () => {
      expect(expressions.hasExpression()).to.be.false;
    });
  });
});
