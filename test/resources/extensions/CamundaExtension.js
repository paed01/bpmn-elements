import fs from 'fs';

const camundaBpmnModdle = JSON.parse(fs.readFileSync('./node_modules/camunda-bpmn-moddle/resources/camunda.json'));

export default {
  extension: Camunda,
  moddleOptions: camundaBpmnModdle,
};

function Camunda(activity) {
  const { broker, environment, type, behaviour } = activity;

  return {
    type: 'camunda:extension',
    extensions: { camundaExtension },
    activate,
    deactivate,
  };

  function activate() {
    camundaExtension();
  }

  function deactivate() {
    broker.cancel('_camunda_form');
    broker.cancel('_camunda_io');
    broker.cancel('_camunda_due_date');
  }

  function camundaExtension() {
    if (activity.behaviour.extensionElements) {
      for (const extension of activity.behaviour.extensionElements.values) {
        switch (extension.$type) {
          case 'camunda:FormData':
            formFormatting(extension);
            break;
          case 'camunda:InputOutput':
            ioFormatting(extension);
            break;
        }
      }
    }
    if (activity.behaviour.expression) {
      activity.behaviour.Service = ServiceExpression;
    }
    if (activity.behaviour.dueDate) {
      dueDateFormatting(activity.behaviour.dueDate);
    }
    if (activity.behaviour.resultVariable) {
      activity.on('end', (api) => {
        activity.environment.output[activity.behaviour.resultVariable] = api.content.output;
      });
    }
  }

  function ServiceExpression() {
    const expression = behaviour.expression;
    const stype = `${type}:expression`;
    return {
      type: stype,
      expression,
      execute,
    };
    function execute(executionMessage, callback) {
      const serviceFn = environment.resolveExpression(expression, executionMessage);
      serviceFn.call(activity, executionMessage, (err, result) => {
        callback(err, result);
      });
    }
  }

  function formFormatting(formData) {
    broker.subscribeTmp(
      'event',
      'activity.enter',
      (_, message) => {
        const form = {
          fields: {},
        };
        formData.fields.forEach((field) => {
          form.fields[field.id] = { ...field };
          form.fields[field.id].defaultValue = environment.resolveExpression(form.fields[field.id].defaultValue, message);
        });
        broker.publish('format', 'run.form', { form });
      },
      { noAck: true, consumerTag: '_camunda_form' }
    );
  }

  function dueDateFormatting(dueDate) {
    broker.subscribeTmp(
      'event',
      'activity.enter',
      (_, message) => {
        const dueDateMs = Date.parse(environment.resolveExpression(dueDate, message));

        if (isNaN(dueDateMs)) return;

        broker.publish('format', 'run.duedate', {
          dueDate: new Date(dueDateMs),
        });
      },
      { noAck: true, consumerTag: '_camunda_due_date' }
    );
  }

  function ioFormatting(ioData) {
    if (ioData.inputParameters) {
      broker.subscribeTmp(
        'event',
        'activity.enter',
        (_, message) => {
          const input = ioData.inputParameters.reduce((result, data) => {
            result[data.name] = environment.resolveExpression(data.value, message);
            return result;
          }, {});
          broker.publish('format', 'run.input', { input });
        },
        { noAck: true }
      );
    }
    if (ioData.outputParameters) {
      broker.subscribeTmp(
        'event',
        'activity.execution.completed',
        (_, message) => {
          const output = {};
          ioData.outputParameters.forEach((data) => {
            output[data.name] = environment.resolveExpression(data.value, message);
          });

          Object.assign(environment.output, output);

          broker.publish('format', 'run.output', { output });
        },
        { noAck: true, consumerTag: '_camunda_io' }
      );
    }
  }
}
