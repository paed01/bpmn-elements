import { SubProcess } from './SubProcess.js';
/**
 * Transaction
 * @param {import('moddle-context-serializer').Activity} activityDef
 * @param {import('#types').ContextInstance} context
 */
export function Transaction(activityDef, context) {
  const transaction = { type: 'transaction', ...activityDef, isTransaction: true };
  const activity = SubProcess(transaction, context);
  return activity;
}
