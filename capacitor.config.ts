import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.valecraft.online',
  appName: 'Valecraft Online',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0d14',
  },
};

export default config;
