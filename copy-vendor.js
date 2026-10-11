// Copies the Capacitor browser builds into www/vendor (no bundler needed)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www', 'vendor');
fs.mkdirSync(out, { recursive: true });
const files = {
  'capacitor.js': 'node_modules/@capacitor/core/dist/capacitor.js',
  'local-notifications.js': 'node_modules/@capacitor/local-notifications/dist/plugin.js',
  'speech-recognition.js': 'node_modules/@capacitor-community/speech-recognition/dist/plugin.js'
};
for (const [name, src] of Object.entries(files)) {
  const code = fs.readFileSync(path.join(root, src), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  fs.writeFileSync(path.join(out, name), code);
  console.log('vendor:', name);
}
