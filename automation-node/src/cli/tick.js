// apps/producer/Trigger.gsの時間主導トリガー（installProducerTrigger）に代わる
// Node版のエントリポイント。GAS版はGAS自体のトリガーが定期的にrunProducerTick()を
// 呼んでいたが、Node版はスケジューリングをこのCLIの外側（cron/systemd timer等）に
// 委ね、1回の起動で runProducerTick() を1tickだけ実行する。

const { openDb } = require('../storage/db');
const { runProducerTick } = require('../producerTick');

async function main() {
  const db = openDb();
  try {
    await runProducerTick(db);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
