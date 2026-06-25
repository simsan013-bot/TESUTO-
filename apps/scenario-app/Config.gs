// ==================================================
//  Scenario Optimization AI - Config
// ==================================================
// [Setup]
//  1. Script Settings > Script Properties:
//       AI_PROVIDER  : "claude" or "openai"
//       CLAUDE_KEY   : sk-ant-api03-...
//       OPENAI_KEY   : sk-...
//  2. Add allowed emails to ALLOWED_EMAILS
//  3. Deploy > New Deployment > Web App
//     （executeAs: USER_ACCESSING のままにすること。checkAuth()が
//      アクセスしたユーザー本人のGmailを見て許可判定するため、
//      USER_DEPLOYINGに変えると全員がデプロイ者として扱われてしまう）
// ==================================================

var ALLOWED_EMAILS = [
  'your-email@gmail.com',
  // 'member2@gmail.com',
];

function checkAuth() {
  var email = Session.getActiveUser().getEmail();
  return { allowed: ALLOWED_EMAILS.includes(email), email: email };
}

function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
