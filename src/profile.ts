// Tells Jellyfin what this browser can play, so it only transcodes when it must.

function can(type: string): boolean {
  const v = document.createElement('video');
  if (v.canPlayType(type).replace('no', '')) return true;
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type);
}

export function videoProfile(maxBitrate = 120_000_000) {
  const mp4Video = ['h264'];
  if (can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"')) mp4Video.push('hevc');
  if (can('video/mp4; codecs="av01.0.08M.08"')) mp4Video.push('av1');
  if (can('video/mp4; codecs="vp09.00.10.08"')) mp4Video.push('vp9');
  const webmVideo = ['vp8', 'vp9'];
  if (can('video/webm; codecs="av01.0.08M.08"')) webmVideo.push('av1');

  const mp4Audio = ['aac', 'mp3'];
  if (can('audio/mp4; codecs="opus"')) mp4Audio.push('opus');
  if (can('audio/mp4; codecs="flac"')) mp4Audio.push('flac');
  if (can('audio/mp4; codecs="ac-3"')) mp4Audio.push('ac3');
  if (can('audio/mp4; codecs="ec-3"')) mp4Audio.push('eac3');

  // hls.js can only play HEVC from fMP4 segments, not MPEG-TS. So when the browser can decode
  // HEVC, ask for fMP4 HLS and let the server copy the video untouched; otherwise h264 in TS.
  const hevc = mp4Video.includes('hevc');
  const hlsProfile = hevc
    ? { Container: 'mp4', VideoCodec: 'hevc,h264' }
    : { Container: 'ts', VideoCodec: 'h264' };

  return {
    Name: 'Inflight Entertainment (browser)',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: maxBitrate,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v', Type: 'Video', VideoCodec: mp4Video.join(','), AudioCodec: mp4Audio.join(',') },
      { Container: 'webm', Type: 'Video', VideoCodec: webmVideo.join(','), AudioCodec: 'vorbis,opus' },
      { Container: 'mp3', Type: 'Audio' },
      { Container: 'aac,m4a,m4b', Type: 'Audio', AudioCodec: 'aac' },
      { Container: 'flac', Type: 'Audio' },
      { Container: 'webm,ogg', Type: 'Audio', AudioCodec: 'opus,vorbis' },
      { Container: 'wav', Type: 'Audio' },
    ],
    TranscodingProfiles: [
      // HLS lets the player seek anywhere in a transcode without restarting it.
      { ...hlsProfile, Type: 'Video', AudioCodec: 'aac,mp3', Protocol: 'hls', Context: 'Streaming', MaxAudioChannels: '2', MinSegments: 1 },
      { Container: 'mp4', Type: 'Audio', AudioCodec: 'aac', Protocol: 'http', Context: 'Streaming', MaxAudioChannels: '2' },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      // Text subtitles are fetched as WebVTT; image subtitles (PGS etc.) are burned in when chosen.
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
      { Format: 'subrip', Method: 'External' },
      { Format: 'ass', Method: 'External' },
      { Format: 'ssa', Method: 'External' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
    ],
  };
}

export function canPlayHlsNatively(): boolean {
  return !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
}
