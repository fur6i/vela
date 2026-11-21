function isYouTubeStreamRejection(details, pageUrl) {
  try {
    const media = new URL(details.url), page = new URL(pageUrl);
    return details.statusCode === 403 && media.protocol === 'https:' && media.hostname.endsWith('.googlevideo.com') &&
      media.pathname === '/videoplayback' && media.searchParams.get('source') !== 'yt_ads' &&
      page.protocol === 'https:' && page.hostname === 'www.youtube.com' && /^[\w-]{11}$/.test(page.searchParams.get('v') || '');
  } catch { return false; }
}
function playerRecoveryScript(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid video id');
  const recover = function (id) {
    if (new URL(location.href).searchParams.get('v') !== id) return false;
    const video = document.querySelector('video'), player = document.getElementById('movie_player');
    if (!video || video.readyState >= 2 || video.currentTime > .1 || !player?.loadVideoById || player.classList.contains('ad-showing')) return false;
    const startSeconds = player.getPlayerResponse?.()?.playerConfig?.playbackStartConfig?.startSeconds || 0;
    player.loadVideoById({ videoId: id, startSeconds });
    return true;
  };
  return `(${recover.toString()})(${JSON.stringify(videoId)})`;
}
module.exports = { isYouTubeStreamRejection, playerRecoveryScript };
