import { Layouter } from './Layouter.js';

export function layoutProcess(xml, debuggerCounter) {
  return new Layouter(debuggerCounter).layoutProcess(xml);
}
