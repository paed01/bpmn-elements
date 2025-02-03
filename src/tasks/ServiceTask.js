import Activity from '../activity/Activity.js';
import { ActivityError } from '../error/Errors.js';
import { cloneMessage, cloneContent } from '../messageHelper.js';

export default function ServiceTask(activityDef, context) {
  return new Activity(ServiceTaskBehaviour, activityDef, context);
}

export function ServiceTaskBehaviour(activity) {
  const { id, type, behaviour } = activity;

  this.id = id;
  this.type = type;
  this.loopCharacteristics =
    behaviour.loopCharacteristics && new behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  this.activity = activity;
  this.environment = activity.environment;
  this.broker = activity.broker;
}

ServiceTaskBehaviour.prototype.execute = function execute(executeMessage) {
  const executeContent = executeMessage.content;
  const loopCharacteristics = this.loopCharacteristics;
  if (loopCharacteristics && executeContent.isRootScope) {
    return loopCharacteristics.execute(executeMessage);
  }

  const executionId = executeContent.executionId;
  const service = (this.service = this.getService(executeMessage));
  if (!service) return this.activity.emitFatal(new ActivityError(`<${this.id}> service not defined`, executeMessage), executeContent);

  const broker = this.broker;
  broker.subscribeTmp('api', `activity.#.${executionId}`, (...args) => this._onApiMessage(executeMessage, ...args), {
    consumerTag: `_api-${executionId}`,
  });

  return service.execute(executeMessage, (err, output) => {
    broker.cancel(`_api-${executionId}`);
    if (err) {
      this.activity.logger.error(`<${executionId} (${this.id})>`, err);
      return broker.publish(
        'execution',
        'execute.error',
        cloneContent(executeContent, { error: new ActivityError(err.message, executeMessage, err) }, { mandatory: true })
      );
    }

    return broker.publish('execution', 'execute.completed', cloneContent(executeContent, { output, state: 'complete' }));
  });
};

ServiceTaskBehaviour.prototype.getService = function getService(message) {
  let Service = this.activity.behaviour.Service;
  if (!Service && this.environment.settings.enableDummyService) Service = DummyService;
  return Service && new Service(this.activity, cloneMessage(message));
};

ServiceTaskBehaviour.prototype._onApiMessage = function onApiMessage(executeMessage, _, message) {
  const broker = this.broker;
  switch (message.properties.type) {
    case 'discard': {
      const executionId = executeMessage.content.executionId;
      broker.cancel(`_api-${executionId}`);
      const service = this.service;
      if (service) {
        if (service.discard) service.discard(message);
        else if (service.stop) service.stop(message);
      }
      this.activity.logger.debug(`<${executionId} (${this.id})> discarded`);
      return broker.publish('execution', 'execute.discard', cloneContent(executeMessage.content, { state: 'discard' }));
    }
    case 'stop': {
      const executionId = executeMessage.content.executionId;
      broker.cancel(`_api-${executionId}`);
      const service = this.service;
      if (service?.stop) service.stop(message);
      return this.activity.logger.debug(`<${executionId} (${this.id})> stopped`);
    }
  }
};

function DummyService(activity) {
  this.type = 'dummyservice';
  this.activity = activity;
}

DummyService.prototype.execute = function executeDummyService(...args) {
  const activity = this.activity;
  activity.logger.debug(`<${activity.id}> executing dummy service`);
  const next = args.pop();
  next();
};
