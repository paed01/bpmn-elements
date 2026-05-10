import { SubProcess } from './SubProcess.js';
export function Transaction(activityDef, context) {
  const transaction = { type: 'transaction', ...activityDef, isTransaction: true };
  const activity = SubProcess(transaction, context);
  return activity;
}
