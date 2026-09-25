/**
 * 用 @electron/packager 的 Node API 打包（CLI 在本机静默退出，改用 API 并打印错误）。
 */
import packager from '@electron/packager';

const options = {
  dir: '.',
  name: 'DeepSeek Harness',
  platform: 'win32',
  arch: 'x64',
  icon: 'assets/icon.ico',
  out: 'dist',
  overwrite: true,
  prune: true,
  asar: true,
  appVersion: '1.0.0',
  win32metadata: {
    CompanyName: 'Local Install',
    FileDescription: 'DeepSeek Harness Desktop',
    ProductName: 'DeepSeek Harness',
  },
};

try {
  const paths = await packager(options);
  console.log('PACKAGED:', paths.join(', '));
} catch (error) {
  console.error('PACKAGE FAILED:', error);
  process.exitCode = 1;
}
