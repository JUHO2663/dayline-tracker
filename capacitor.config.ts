import type { CapacitorConfig } from '@capacitor/cli';

// Keep the app name and id neutral: they are visible on the home screen and in system settings.
// Never add `server.url` here — the app must only load its own bundled files.
const config: CapacitorConfig = {
  appId: 'io.github.juho2663.dayline',
  appName: 'Dayline',
  webDir: 'dist',
  android: {
    // Disallow loading http:// content inside the app.
    allowMixedContent: false,
  },
};

export default config;
