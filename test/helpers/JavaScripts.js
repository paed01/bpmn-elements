import {Script} from 'vm';

export function Scripts() {
  const scripts = {};

  return {
    getScript,
    register,
    compile,
  };

  function register({id, type, behaviour}) {
    let scriptBody, language;

    switch (type) {
      case 'bpmn:SequenceFlow': {
        if (!behaviour.conditionExpression) return;
        language = behaviour.conditionExpression.language;
        scriptBody = behaviour.conditionExpression.body;
        break;
      }
      default: {
        language = behaviour.scriptFormat;
        scriptBody = behaviour.script;
      }
    }

    const compiled = compile(language, `${type}/${id}`, scriptBody);
    if (!compiled) return;
    scripts[id] = compiled;
  }

  function compile(language, filename, scriptBody) {
    if (!/^javascript$/i.test(language)) return;
    return new Script(scriptBody, {filename});
  }

  function getScript(language, {id}) {
    if (!/^javascript$/i.test(language)) return;
    const script = scripts[id];
    if (!script) return;

    return {
      execute,
    };

    function execute(executionContext, callback) {
      return script.runInNewContext({...executionContext, next: callback});
    }
  }
}
