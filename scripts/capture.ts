import { capturePreview } from '../src/capture/run';
import { options } from './options';

try {
  const { directory, manifest } = await capturePreview(options('capture'));
  if (manifest.error) {
    console.error(manifest.error);
    if (manifest.error.includes("Executable doesn't exist")) console.error('请先执行 pnpm browser:install。');
  }
  console.log(`\n检查结果：${directory}\n状态：${manifest.status}`);
  if (manifest.status !== 'complete') process.exitCode = 1;
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
