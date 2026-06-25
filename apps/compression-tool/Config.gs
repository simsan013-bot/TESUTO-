// スカッと系シナリオ 圧縮・再編集ツール
// [Setup]
//  スクリプトプロパティに以下を設定：
//    CLAUDE_KEY : sk-ant-api03-...

var ALLOWED_EMAILS = [
  'simsan013@gmail.com',
  'light.workers.organization@gmail.com',
];

var MGMT_SHEET_ID   = '1PHV2tZqOOp75nsE7GPEIkuKFn9YAajpZp-JFLcn5Of8';
var MGMT_SHEET_NAME = '全体管理シート';

// ---- 認証 ----
function checkAuth() {
  var email = Session.getActiveUser().getEmail();
  return { allowed: ALLOWED_EMAILS.indexOf(email) >= 0, email: email };
}
