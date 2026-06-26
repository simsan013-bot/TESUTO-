// apps/fish-audio-tts/Code.gs のFish Audio API呼び出し部分（TTS/ASR）を移植したもの。
// エンドポイント・payload・ヘッダー（model: 's2-pro'等）はGAS版と同一。
// APIキーは環境変数 FISH_API_KEY から読む。

async function fishTts(text, voiceId) {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new Error('FISH_API_KEY is not set.');

  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      model: 's2-pro',
    },
    body: JSON.stringify({
      text,
      reference_id: voiceId,
      format: 'wav',
      latency: 'normal',
      chunk_length: 300,
    }),
  });
  if (!res.ok) {
    throw new Error('TTS APIエラー (HTTP ' + res.status + ')');
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fishAsr(wavBuffer) {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new Error('FISH_API_KEY is not set.');

  const form = new FormData();
  form.append('audio', new Blob([wavBuffer]), 'audio.wav');
  form.append('language', 'ja');
  form.append('ignore_timestamps', 'false');

  const res = await fetch('https://api.fish.audio/v1/asr', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: form,
  });
  if (!res.ok) {
    throw new Error('ASR APIエラー (HTTP ' + res.status + ')');
  }
  const json = await res.json();
  return json.segments || [];
}

module.exports = { fishTts, fishAsr };
