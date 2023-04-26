import Definition from '../../src/definition/Definition.js';
import testHelpers from '../helpers/testHelpers.js';
import SequenceFlow from '../../src/flows/SequenceFlow.js';

const camunda = testHelpers.camundaBpmnModdle;

const extensions = {
  camunda: {
    moddleOptions: camunda,
  },
};

class IOProperties {
  constructor(activity, behaviour) {
    this.activity = activity;
    this.behaviour = behaviour;
    this.environment = this.activity.environment;
  }
  resolve(message) {
    const properties = {};

    for (const {id, name, value} of this.behaviour.values) {
      properties[id || name] = this.environment.resolveExpression(value, message);
    }

    return properties;
  }
}

class SequenceFlowExtension {
  constructor(flow, context) {
    this.element = flow;
    this.context = context;
    this.extension = this.load();
  }
  activate() {
    let idx = 0;
    for (const listener of this.extension.listeners) {
      this.element.broker.subscribeTmp('event', 'flow.take', this._onFlowTake(listener), {noAck: true, consumerTag: '_ontake-listener-extension_' + (idx++)});
    }
  }
  deactivate() {
    let idx = 0;
    for (const listener of this.extension.listeners) {
      listener.outbound.broker.cancel('_ontake-listener-extension_' + (idx++));
    }
  }
  load() {
    const result = {listeners: new Set()};
    const environment = this.context.environment;
    const flow = this.element;
    const extValues = flow.behaviour.extensionElements?.values;
    if (!extValues) return result;

    let idx = 0;

    for (const ext of extValues) {
      switch (ext.$type) {
        case 'camunda:ExecutionListener': {
          const {event, script} = ext;
          const name = `${ext.$type}/${flow.id}/on${event}/${idx++}`;

          const execScript = environment.scripts.register({
            id: name,
            type: ext.$type,
            behaviour: {scriptFormat: script.scriptFormat, script: script.value},
            environment,
          });
          result.listeners.add({name, outbound: flow, execScript});
          break;
        }
        case 'camunda:Properties':
          result.properties = new IOProperties(flow, ext);
          break;
      }
    }

    return result;
  }
  resolveProperties(fromMessage) {
    const properties = this.extension.properties;
    if (!properties) return;

    return properties.resolve(fromMessage);
  }
  _onFlowTake(listener) {
    const {name, outbound} = listener;
    return function runScript(_, message, owner) {
      const script = owner.environment.getScript('js', {id: name});
      script.execute(outbound.getApi(message), () => {});
    };
  }
}

class ExtendedSequenceFlow extends SequenceFlow {
  constructor(flowDef, context) {
    super(flowDef, context);
    this.extensions = new SequenceFlowExtension(this, context);
    this.extensions.activate();
  }
  evaluate(fromMessage, callback) {
    const properties = this.extensions.extension.properties;
    if (!properties) return super.evaluate(fromMessage, callback);

    super.evaluate(fromMessage, (err, result) => {
      let overriddenResult = result ? {} : false;
      if (result) {
        overriddenResult = {
          ...(typeof result === 'object' && result),
          properties: properties.resolve(fromMessage),
        };
      }
      callback(err, overriddenResult);
    });
  }
}

class SequenceFlowOverrideExtensions {
  constructor(elm, context) {
    this.element = elm;
    this.context = context;
    this.extensions = this.load();
  }
  activate() {
    for (const ext of this.extensions.values()) {
      ext.activate();
    }
  }
  deactivate() {
    for (const ext of this.extensions.values()) {
      ext.deactivate();
    }
  }
  load() {
    const result = new Map();
    for (const ob of this.element.outbound) {
      const extension = new SequenceFlowExtension(ob, this.context);
      if (extension.extension.properties) {
        this._overrideEvaluate(ob, extension);
      }
      result.set(ob.id, extension);
    }
    return result;
  }
  _overrideEvaluate(outboundFlow, extension) {
    const evaluateFn = outboundFlow.evaluate;
    outboundFlow.evaluate = function overrideEvaluate(fromMessage, callback) {
      evaluateFn.call(outboundFlow, fromMessage, (err, result) => {
        let overriddenResult = result ? {} : false;
        if (result) {
          overriddenResult = {
            ...(typeof result === 'object' && result),
            properties: extension.resolveProperties(fromMessage),
          };
        }
        callback(err, overriddenResult);
      });
    };
  }
}

Feature('Sequence flow', () => {
  const source = `
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="bp" isExecutable="true">
      <startEvent id="start" />
      <sequenceFlow id="to-end1" sourceRef="start" targetRef="end1">
        <extensionElements>
          <camunda:properties>
            <camunda:property name="prop1" value="1" />
          </camunda:properties>
          <camunda:executionListener event="take">
            <camunda:script scriptFormat="javascript">
              const taken = this.environment.output.taken = this.environment.output.taken || [];
              taken.push({id: this.id, properties: this.content.properties})
              next();
            </camunda:script>
          </camunda:executionListener>
        </extensionElements>
      </sequenceFlow>
      <endEvent id="end1" />
      <sequenceFlow id="to-end2" sourceRef="start" targetRef="end2">
        <conditionExpression xsi:type="tFormalExpression" language="javascript">next(null, { scripted: 2 })</conditionExpression>
        <extensionElements>
          <camunda:properties>
            <camunda:property name="prop2" value="2" />
          </camunda:properties>
        </extensionElements>
      </sequenceFlow>
      <endEvent id="end2" />
    </process>
  </definitions>`;

  Scenario('extend sequence flow behaviour by passing new sequence flow type', () => {
    let definition;
    Given('two start events, both waiting for a message and both ending with the same end event', async () => {
      const context = await testHelpers.context(source, {
        extensions,
        types: {
          SequenceFlow: ExtendedSequenceFlow,
        },
      });
      definition = new Definition(context);
    });

    const messages = [];
    let end;
    When('definition is ran', () => {
      definition.broker.subscribeTmp('event', 'activity.start', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      end = definition.waitFor('end');
      definition.run();
    });

    Then('then sequence flow extension is forwarded to target', async () => {
      await end;
      expect(messages.length).to.be.above(1);
      expect(messages[1].content.inbound[0].properties).to.have.property('prop1', '1');
    });

    And('extension listeners has executed', () => {
      expect(definition.environment.output).to.have.property('taken').that.deep.equal([
        { id: 'to-end1', properties: {prop1: '1'} },
      ]);
    });

    And('sequence flow condition result is forwarded to target', () => {
      expect(messages[2].content).to.have.property('id', 'end2');
      expect(messages[2].content.inbound[0]).to.have.property('scripted', 2);
      expect(messages[2].content.inbound[0]).to.have.property('properties').that.deep.equal({prop2: '2'});
    });
  });

  Scenario('extend sequence flow behaviour by overriding flow evaluate method', () => {
    let definition;
    Given('two start events, both waiting for a message and both ending with the same end event', async () => {
      const context = await testHelpers.context(source, {extensions});
      definition = new Definition(context, {
        extensions: {
          SequenceFlowExt,
        },
      });

      function SequenceFlowExt(elm, ctx) {
        if (!elm.outbound?.length) return;
        return new SequenceFlowOverrideExtensions(elm, ctx);
      }
    });

    const messages = [];
    let end;
    When('definition is ran', () => {
      definition.broker.subscribeTmp('event', 'activity.start', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      end = definition.waitFor('end');
      definition.run();
    });

    Then('then sequence flow extension is forwarded to target', async () => {
      await end;
      expect(messages.length).to.be.above(1);
      expect(messages[1].content.inbound[0].properties).to.have.property('prop1', '1');
    });

    And('extension listeners has executed', () => {
      expect(definition.environment.output).to.have.property('taken').that.deep.equal([
        { id: 'to-end1', properties: {prop1: '1'} },
      ]);
    });

    And('sequence flow condition result is forwarded to target', () => {
      expect(messages[2].content).to.have.property('id', 'end2');
      expect(messages[2].content.inbound[0]).to.have.property('scripted', 2);
      expect(messages[2].content.inbound[0]).to.have.property('properties').that.deep.equal({prop2: '2'});
    });
  });
});
