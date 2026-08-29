const CONSUMER_TAG = '_output-extension';

/**
 * Built-in output extension. Assigns activity end output to `environment.output`.
 * Attached by the context when `environment.settings.assignOutput` is set and no user extension attached to the activity.
 * @param {import('#types').Activity | import('#types').ElementBase | import('../activity/Activity.js').Activity} activity
 * @param {import('#types').ContextInstance} context
 * @param {import('#types').AssignOutputType} [assignType] how output is assigned, defaults to `off`
 * @satisfies {import('#types').IExtension}
 */
export function OutputExtension(activity, context, assignType) {
  this.activity = activity;
  this.context = context;
  this.type = 'output';
  this.assignType = assignType || 'off';
  /** @internal */
  this._onEndHandler = this.onEnd.bind(this);
}

/** Subscribe to the activity end event for the duration of the run */
OutputExtension.prototype.activate = function activate() {
  this.activity.broker.subscribeTmp('event', 'activity.end', this._onEndHandler, { noAck: true, consumerTag: CONSUMER_TAG });
};

/** Drop the end subscription */
OutputExtension.prototype.deactivate = function deactivate() {
  this.activity.broker.cancel(CONSUMER_TAG);
};

/**
 * Assign end message output to environment output. Override to change how output is stored.
 * @param {string} _routingKey
 * @param {import('#types').ElementBrokerMessage} message
 */
OutputExtension.prototype.onEnd = function onEnd(_routingKey, message) {
  const { id, output } = message.content;
  if (output === undefined) return;
  const environmentOutput = this.context.environment.output;
  switch (this.assignType) {
    case 'id':
      environmentOutput[id] = output;
      break;
    case 'auto':
      if (output !== null && typeof output === 'object' && !Array.isArray(output)) Object.assign(environmentOutput, output);
      else environmentOutput[id] = output;
      break;
  }
};
