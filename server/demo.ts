import type { Category, Channel, Episode, Program, SeriesItem, VodItem } from './types.js';

export const demoCategories: Record<string, Category[]> = {
  live: [
    { id: 'news', name: 'News' }, { id: 'sports', name: 'Sports' }, { id: 'nature', name: 'Documentary' }
  ],
  vod: [{ id: 'cinema', name: 'Cinema' }, { id: 'family', name: 'Family' }],
  series: [{ id: 'drama', name: 'Drama' }, { id: 'science', name: 'Science' }]
};

const logo = (label: string, color: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect width="100%" height="100%" rx="18" fill="${color}"/><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="34" font-weight="700" fill="white">${label}</text></svg>`)}`;
const poster = (title: string, color: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540"><rect width="100%" height="100%" fill="${color}"/><circle cx="180" cy="210" r="95" fill="rgba(255,255,255,.12)"/><text x="50%" y="78%" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="white">${title}</text></svg>`)}`;

export const demoChannels: Channel[] = [
  { id: '101', name: 'World News HD', categoryId: 'news', logo: logo('WORLD', '#1769aa'), epgChannelId: 'world.demo', number: 1, extension: 'm3u8' },
  { id: '102', name: 'City 24', categoryId: 'news', logo: logo('CITY 24', '#7b1fa2'), epgChannelId: 'city.demo', number: 2, extension: 'm3u8' },
  { id: '201', name: 'Arena Sports', categoryId: 'sports', logo: logo('ARENA', '#00897b'), epgChannelId: 'arena.demo', number: 3, extension: 'm3u8' },
  { id: '202', name: 'Goal Live', categoryId: 'sports', logo: logo('GOAL', '#e65100'), epgChannelId: 'goal.demo', number: 4, extension: 'm3u8' },
  { id: '301', name: 'Planet Earth', categoryId: 'nature', logo: logo('PLANET', '#2e7d32'), epgChannelId: 'planet.demo', number: 5, extension: 'm3u8' },
  { id: '302', name: 'Wild World', categoryId: 'nature', logo: logo('WILD', '#5d4037'), epgChannelId: 'wild.demo', number: 6, extension: 'm3u8' }
];

export const demoVod: VodItem[] = [
  { id: '501', name: 'Beyond the Horizon', categoryId: 'cinema', poster: poster('HORIZON', '#263b6a'), year: '2025', rating: '8.2', duration: '1h 48m', genre: 'Adventure', description: 'An explorer follows a mysterious signal beyond the last mapped coastline.', extension: 'mp4' },
  { id: '502', name: 'Midnight Signal', categoryId: 'cinema', poster: poster('SIGNAL', '#4a235a'), year: '2024', rating: '7.6', duration: '1h 39m', genre: 'Thriller', description: 'A late-night radio host receives a transmission that should not exist.', extension: 'mp4' },
  { id: '503', name: 'The Long Way Home', categoryId: 'cinema', poster: poster('HOME', '#7d4e24'), year: '2023', rating: '7.9', duration: '2h 03m', genre: 'Drama', description: 'Old friends reunite for a journey across the country.', extension: 'mp4' },
  { id: '601', name: 'Cloud Garden', categoryId: 'family', poster: poster('GARDEN', '#167d77'), year: '2025', rating: '8.0', duration: '1h 31m', genre: 'Family', description: 'Two siblings discover a garden floating above their town.', extension: 'mp4' }
];

export const demoSeries: SeriesItem[] = [
  { id: '701', name: 'Northern Lights', categoryId: 'drama', poster: poster('NORTH', '#214d63'), year: '2025', rating: '8.5', genre: 'Drama', description: 'A small northern town guards a decades-old secret.' },
  { id: '702', name: 'The Observatory', categoryId: 'science', poster: poster('ORBIT', '#28304d'), year: '2024', rating: '8.1', genre: 'Science', description: 'Astronomers discover a pattern hidden in deep-space signals.' }
];

export const demoEpisodes: Record<string, Episode[]> = {
  '701': [1, 2, 3, 4, 5, 6].map((episode) => ({ id: `71${episode}`, name: ['Arrival', 'The Letter', 'Whiteout', 'Echoes', 'The Crossing', 'Daybreak'][episode - 1]!, season: episode > 3 ? 2 : 1, episode: episode > 3 ? episode - 3 : episode, extension: 'mp4', duration: '48m' })),
  '702': [1, 2, 3, 4].map((episode) => ({ id: `72${episode}`, name: ['First Light', 'Parallax', 'The Array', 'Contact'][episode - 1]!, season: 1, episode, extension: 'mp4', duration: '52m' }))
};

export function demoPrograms(): Program[] {
  const slot = 30 * 60 * 1000;
  const start = Math.floor(Date.now() / slot) * slot;
  return demoChannels.flatMap((channel, index) => [
    { channelId: channel.epgChannelId!, title: ['Morning Briefing', 'City Report', 'Live Championship', 'Matchday', 'Ocean Giants', 'Wild Americas'][index]!, description: 'Demo programme information.', start, end: start + slot },
    { channelId: channel.epgChannelId!, title: ['World Update', 'Market Watch', 'Sports Desk', 'Classic Goals', 'Living Planet', 'Night Hunters'][index]!, start: start + slot, end: start + slot * 2 }
  ]);
}
