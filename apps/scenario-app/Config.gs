// ==================================================
//  Scenario Optimization AI - Config
// ==================================================
// [Setup]
//  1. Script Settings > Script Properties:
//       AI_PROVIDER  : "claude" or "openai"
//       CLAUDE_KEY   : sk-ant-api03-...
//       OPENAI_KEY   : sk-...
//  2. Deploy > New Deployment > Web App
// ==================================================

function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
