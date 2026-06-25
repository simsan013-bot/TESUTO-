// シナリオ/アナリストFB工程の出力（title・design・steps）をワークの
// フォルダIDにDocとして保存し、次工程の入力として読み戻すためのヘルパー。
// 圧縮以降の工程はテキストをそのままJSON送信するため、ここを経由するのは
// 「シナリオ」「アナリストFB」の2工程のみ。
//
// Doc本文の形式（行頭が完全一致する行を区切りとして使う。シナリオ本文には
// 「STEP〇」見出しの出力自体が禁止されているため、この区切り行と衝突しない）：
//   ===TITLE===
//   {title}
//   ===DESIGN===
//   {design}
//   ===STEP===
//   {steps[0]}
//   ===STEP===
//   {steps[1]}
//   ...

function buildStepsDocText_(title, design, steps) {
  var parts = ['===TITLE===', title, '===DESIGN===', design];
  for (var i = 0; i < steps.length; i++) {
    parts.push('===STEP===');
    parts.push(steps[i]);
  }
  return parts.join('\n');
}

function parseStepsDocText_(text) {
  var lines = text.split('\n');
  var sections = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === '===TITLE===' || line === '===DESIGN===' || line === '===STEP===') {
      current = { label: line.replace(/=/g, ''), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  var title = '';
  var design = '';
  var steps = [];
  for (var j = 0; j < sections.length; j++) {
    var sec = sections[j];
    var sectionText = sec.lines.join('\n').replace(/\n+$/, '');
    if (sec.label === 'TITLE') title = sectionText;
    else if (sec.label === 'DESIGN') design = sectionText;
    else if (sec.label === 'STEP') steps.push(sectionText);
  }

  return { title: title, design: design, steps: steps };
}

function saveTextAsDoc_(folderId, fileName, text) {
  var doc = DocumentApp.create(fileName);
  doc.getBody().setText(text);
  doc.saveAndClose();

  var docId = doc.getId();
  if (folderId) {
    moveDocToFolder_(docId, DriveApp.getFolderById(folderId));
  }
  return docId;
}

// apps/character-script-app/Code.gsのmoveDocToFolderと同じフォールバック
// （共有ドライブ間でmoveTo()が失敗する場合にaddFile/removeFileで代替する）。
function moveDocToFolder_(docId, outputFolder) {
  var docFile = DriveApp.getFileById(docId);
  try {
    docFile.moveTo(outputFolder);
  } catch (e1) {
    outputFolder.addFile(docFile);
    var parents = docFile.getParents();
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() !== outputFolder.getId()) {
        try { p.removeFile(docFile); } catch (e2) {}
      }
    }
  }
}

function loadDocText_(docId) {
  return DocumentApp.openById(docId).getBody().getText();
}
