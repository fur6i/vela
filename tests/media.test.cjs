const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { isYouTubeStreamRejection, playerRecoveryScript } = require('../src/media.cjs');
test('stream recovery is restricted to rejected YouTube content streams', () => {
  const page = 'https://www.youtube.com/watch?v=vDmjw-c_R2k';
  const details = { statusCode: 403, url: 'https://rr1.googlevideo.com/videoplayback?source=youtube' };
  assert.equal(isYouTubeStreamRejection(details, page), true);
  assert.equal(isYouTubeStreamRejection({ ...details, statusCode: 200 }, page), false);
  assert.equal(isYouTubeStreamRejection({ ...details, url: 'https://googlevideo.com.evil.test/videoplayback' }, page), false);
  assert.equal(isYouTubeStreamRejection({ ...details, url: 'https://rr1.googlevideo.com/videoplayback?source=yt_ads' }, page), false);
  assert.equal(isYouTubeStreamRejection(details, 'https://example.com'), false);
});
test('recovery preserves the requested start and leaves working/ad players alone', () => {
  const calls = [];
  const video = { readyState: 0, currentTime: 0 };
  let ad = false;
  const player = { classList: { contains: () => ad }, getPlayerResponse: () => ({ playerConfig: { playbackStartConfig: { startSeconds: 120 } } }), loadVideoById: (options) => calls.push(options) };
  const context = { URL, location: { href: 'https://www.youtube.com/watch?v=vDmjw-c_R2k' }, document: { querySelector: () => video, getElementById: () => player } };
  const script = playerRecoveryScript('vDmjw-c_R2k');
  assert.equal(vm.runInNewContext(script, context), true);
  assert.equal(calls[0].startSeconds, 120);
  video.readyState = 4;
  assert.equal(vm.runInNewContext(script, context), false);
  video.readyState = 0; ad = true;
  assert.equal(vm.runInNewContext(script, context), false);
  assert.equal(calls.length, 1);
  assert.throws(() => playerRecoveryScript('unsafe"input'));
});
