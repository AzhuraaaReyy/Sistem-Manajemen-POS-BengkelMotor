import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { buildEchoAuthHeaders } from './websocketConfig';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo<'reverb'>;
  }
}

window.Pusher = Pusher;

export const echo = new Echo<'reverb'>({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 80,
  wssPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 443,
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
  disableStats: true,
  withCredentials: true,
  auth: {
    headers: buildEchoAuthHeaders(true),
  },
});

window.Echo = echo;
