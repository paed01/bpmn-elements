import {Script} from 'vm';

export function Scripts(enableDummy = true) {
  const scripts = {};

  return {
    getScript,
    register,
    compile,
  };

  function register({id, type, behaviour, logger, environment}) {
    let scriptBody, language;

    switch (type) {
      case 'bpmn:SequenceFlow': {
        if (!behaviour.conditionExpression) return;
        language = behaviour.conditionExpression.language;
        if (!language) return;
        scriptBody = behaviour.conditionExpression.body;
        break;
      }
      default: {
        language = behaviour.scriptFormat;
        scriptBody = behaviour.script;
      }
    }

    if (!language || !scriptBody) {
      if (!enableDummy) return;
      const script = new DummyScript(language, `${type}/${id}`, logger);
      scripts[id] = script;
      return script;
    }

    if (!/^javascript$/i.test(language) && language !== 'js') return;

    const script = new JavaScript(language, `${type}/${id}`, scriptBody, environment);
    scripts[id] = script;

    return script;
  }

  function compile(language, filename, scriptBody) {
    return new Script(scriptBody, {filename});
  }

  function getScript(language, {id}) {
    return scripts[id];
  }
}

function JavaScript(language, filename, scriptBody, environment) {
  this.id = filename;
  this.script = new Script(scriptBody, {filename});
  this.language = language;
  this.environment = environment;
}

JavaScript.prototype.execute = function execute(executionContext, callback) {
  const timers = this.environment.timers.register(executionContext);
  return this.script.runInNewContext({...executionContext, ...timers, next: callback});
};

function DummyScript(language, filename, logger) {
  this.id = filename;
  this.isDummy = true;
  this.language = language;
  this.logger = logger;
}

DummyScript.prototype.execute = function execute(executionContext, callback) {
  const {id, executionId} = executionContext.content;
  this.logger.debug(`<${executionId} (${id})> passthrough dummy script ${this.language || 'esperanto'}`);
  callback();
};
