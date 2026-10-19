// Sanitized get_series_info structure inspected on the configured provider.
// 406214 and 418954 belonged to series 2752; 405597 belonged to 2751.
// A third variant within 2752 is modeled to exercise the reported three-stream case.
export const seriesId = '2752';
const variant = (id: string, rich = false) => ({
  id, episode_num: '1', title: 'S03E01', container_extension: 'mp4', season: 3,
  info: { release_date: rich ? '2026-06-21' : null, plot: rich ? 'Episode plot' : null,
    duration_secs: 3936, duration: '01:05:36', bitrate: rich ? 3098 : 1950,
    rating: rich ? '7' : null, season: '3', tmdb_id: rich ? '7196563' : '',
    cover_big: null, movie_image: null },
  subtitles: [], custom_sid: '', added: '1786985463', direct_source: ''
});
export const rawVariants = {
  seasons: [{ season_number: 3 }], info: { name: 'A Casa do Dragão [L]' },
  episodes: { '3': [variant('418954'), variant('406214', true), variant('419000')] }
};
export const otherSeries = { info: { name: 'A Casa do Dragão' }, episodes: { '3': [variant('405597')] } };
