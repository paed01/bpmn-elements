/**
 * Get take conditional sequence flow services
 * @returns services to use in conditional sequence flows
 */
export function getTakeServices() {
  return {
    takeFlow() {
      return true;
    },
    takeOnce({ content, environment }) {
      const onceId = `${environment.variables.content.executionId}_${content.id}`;
      const count = environment.variables[onceId] ?? 0;
      environment.variables[onceId] = count + 1;
      return count === 0;
    },
    takeTwice({ content, environment }) {
      const onceId = `${environment.variables.content.executionId}_${content.id}`;
      const count = environment.variables[onceId] ?? 0;
      environment.variables[onceId] = count + 1;
      return count === 1;
    },
  };
}
