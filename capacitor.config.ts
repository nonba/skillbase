import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.easystance.homebase',
  appName: 'HOMEBASE',
  webDir: 'out',
  server: {
    // 起動時にローカルファイルではなく、直接本番サイト(Cloudflare Workers)を読み込む設定。
    url: 'https://homebase.easystance.app',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
