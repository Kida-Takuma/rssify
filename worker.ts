import feeds from './feeds/index.ts';
import { createWorker } from './src/index.ts';

export default createWorker({ feeds });
