import { SubProcess } from './SubProcess.js';
/**
 * Transaction
 * @param {import('#types').ActivityDefinition} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function Transaction(activityDef, context) {
  const transaction = { type: 'transaction', ...activityDef, isTransaction: true };
  const activity = SubProcess(transaction, context);
  return activity;
}
