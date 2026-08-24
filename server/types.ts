export type MediaKind = 'live' | 'movie' | 'series';

export interface AppConfig {
  xtreamBaseUrl: string;
  xtreamUsername: string;
  xtreamPassword: string;
  xmltvUrl: string;
  epgRefreshHours: number;
  preferredLiveFormat: 'auto' | 'hls' | 'ts';
  autoplayLive: boolean;
  rememberLastChannel: boolean;
  demoMode: boolean;
}

export interface Category { id: string; name: string }

export interface Channel {
  id: string;
  name: string;
  categoryId: string;
  logo?: string;
  epgChannelId?: string;
  number?: number;
  extension?: string;
}

export interface VodItem {
  id: string;
  name: string;
  categoryId: string;
  poster?: string;
  backdrop?: string;
  year?: string;
  rating?: string;
  duration?: string;
  genre?: string;
  description?: string;
  extension?: string;
}

export interface SeriesItem extends Omit<VodItem, 'extension'> {}

export interface Episode {
  id: string;
  name: string;
  season: number;
  episode: number;
  extension?: string;
  duration?: string;
  description?: string;
}

export interface Program {
  channelId: string;
  title: string;
  description?: string;
  start: number;
  end: number;
}

export interface Favorite { type: MediaKind; id: string; item: Channel | VodItem | SeriesItem; addedAt: number }
export interface HistoryItem { type: MediaKind; id: string; item: Channel | VodItem | Episode; position: number; duration: number; watchedAt: number }
