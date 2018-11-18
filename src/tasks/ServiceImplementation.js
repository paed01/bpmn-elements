import ExecutionScope from '../activity/ExecutionScope';

export default function ServiceImplementation(activity) {
  const {type: atype, behaviour, environment} = activity;
  const implementation = behaviour.implementation;

  const type = `${atype}:implementation`;

  return {
    type,
    implementation,
    execute,
  };

  function execute(executionMessage, callback) {
    const serviceFn = environment.resolveExpression(implementation, executionMessage);

    if (typeof serviceFn !== 'function') return callback(new Error(`Implementation ${implementation} did not resolve to a function`));

    serviceFn.call(activity, ExecutionScope(activity, executionMessage), (err, ...args) => {
      callback(err, args);
    });
  }
}
