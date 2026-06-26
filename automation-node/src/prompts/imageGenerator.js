// apps/image-generator/ImageGeneration.gs の translateToImagePrompt
// （日本語プロンプト→画像生成用英語プロンプト変換）のシステム指示・マスク処理を
// 一字一句そのまま移植したもの。元の関数はUrlFetchApp呼び出しまで含むが、
// ここではプロンプト文面・マスク/復元ロジックのみを抽出する
// （API呼び出し自体はsrc/stages側で行う）。

var TRANSLATE_SYSTEM_INSTRUCTION =
  'You are an expert prompt engineer specializing in AI image generation. '
  + 'Convert the given Japanese description into a detailed English image generation prompt. '
  + 'Translate and include ALL details. Preserve every specific instruction. '
  + 'CRITICAL: Any placeholder like __KEEP_0__ must be copied EXACTLY as-is. '
  + 'Output ONLY the English prompt. No explanation, no preamble.';

// 「」で囲まれた部分を__KEEP_n__に置換してAIの翻訳対象から保護する。
// 戻り値のkeptを使ってunmaskKeptQuotesで元に戻す。
function maskKeptQuotes(promptJa) {
  var kept = [];
  var masked = promptJa.replace(/「([^」]*)」/g, function (whole, inner) {
    kept.push(inner);
    return '__KEEP_' + (kept.length - 1) + '__';
  });
  return { masked: masked, kept: kept };
}

function unmaskKeptQuotes(translated, kept) {
  for (var i = 0; i < kept.length; i++) {
    var re = new RegExp('__[Kk][Ee][Ee][Pp]_' + i + '__', 'g');
    translated = translated.replace(re, '「' + kept[i] + '」');
  }
  return translated;
}

module.exports = {
  TRANSLATE_SYSTEM_INSTRUCTION: TRANSLATE_SYSTEM_INSTRUCTION,
  maskKeptQuotes: maskKeptQuotes,
  unmaskKeptQuotes: unmaskKeptQuotes,
};
