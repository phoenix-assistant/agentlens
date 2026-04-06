/**
 * agentlens trace - Alias for wrap command
 */

import { wrap } from './wrap';

interface TraceOptions {
  name?: string;
  provider?: string;
}

export async function trace(command: string, options: TraceOptions): Promise<void> {
  return wrap(command, options);
}
