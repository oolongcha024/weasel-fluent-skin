import { options } from './options';
import { startServer } from '../src/server/server';

try {
  const config = options('dev');
  const { server } = await startServer(config);
  console.log(`\n  Weasel Studio\n  输入：${config.config}\n`);
  server.printUrls();
  const stop = () => { void server.close().then(() => process.exit(0)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
