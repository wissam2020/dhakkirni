// Adds exact-alarm permissions + the notification icon to the generated Android project
const fs = require('fs');
const path = require('path');
const app = path.join(__dirname, '..', 'android', 'app', 'src', 'main');
if (!fs.existsSync(app)) { console.log('android/ not found — run: npx cap add android'); process.exit(0); }

const manifestPath = path.join(app, 'AndroidManifest.xml');
let m = fs.readFileSync(manifestPath, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.VIBRATE" />'
];
for (const p of perms) {
  const name = p.match(/name="([^"]+)"/)[1];
  if (!m.includes(`"${name}"`)) m = m.replace('</manifest>', `    ${p}\n</manifest>`);
}
fs.writeFileSync(manifestPath, m);
console.log('patched AndroidManifest.xml');

const drawable = path.join(app, 'res', 'drawable');
fs.mkdirSync(drawable, { recursive: true });
fs.writeFileSync(path.join(drawable, 'ic_stat_reminder.xml'),
`<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.9,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
`);
console.log('added notification icon');
