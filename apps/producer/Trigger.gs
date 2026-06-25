// producerを定期的に自動実行するための時間主導トリガー設定。
//
// 【使い方】
// エディタから installProducerTrigger() を一度だけ実行する（引数なしなら30分おき）。
// 以後はGASが自動でその間隔ごとに runProducerTick() を呼び続ける。
//
// 間隔を変更したい場合は、同じ関数を別の分数を指定して再実行すればよい
// （内部で古いトリガーを削除してから新しいトリガーを作るため、二重登録にはならない）。
// 例: installProducerTrigger(10)  ← 10分おきに変更
//
// 指定できる分数は GAS の仕様上 1 / 5 / 10 / 15 / 30 のいずれかのみ。

function installProducerTrigger(intervalMinutes) {
  var minutes = intervalMinutes || 30;
  uninstallProducerTrigger();
  ScriptApp.newTrigger('runProducerTick')
    .timeBased()
    .everyMinutes(minutes)
    .create();
  Logger.log('✅ ' + minutes + '分おきの自動実行トリガーを設置しました。');
}

function uninstallProducerTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runProducerTick') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
