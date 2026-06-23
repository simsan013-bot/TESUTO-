// スプレッドシート書き込み時、"="始まりの文字列が数式と誤認されるのを防ぐ。
// 読み取り側で文字列比較する場合は .trim() してから比較すること。
function safeCellValue_(value) {
  if (typeof value === 'string' && value.indexOf('=') === 0) {
    return ' ' + value;
  }
  return value;
}

function nowTimestamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}
