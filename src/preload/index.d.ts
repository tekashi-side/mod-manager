import type { FindiasApi } from '../shared/api';

declare global {
  interface Window {
    findias: FindiasApi;
  }
}

export {};
