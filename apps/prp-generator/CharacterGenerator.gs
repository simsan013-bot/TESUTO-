function generateCharacterPrompts_(personDesignText) {
  var rawText = callClaudeApi_(CHAR_SYS_PROMPT, personDesignText);
  return parseCharacterBlocks_(rawText);
}

function parseCharacterBlocks_(text) {
  var blocks = text.split(/(?==== CHAR:)/);
  var result = [];
  for (var i = 0; i < blocks.length; i++) {
    var blk = blocks[i];
    if (!blk.trim()) continue;
    var m = blk.match(/=== CHAR:([^\n]+)===/);
    var name = m ? m[1].trim() : ('キャラクター ' + (result.length + 1));
    var content = blk.replace(/---END---/g, '').trim();
    result.push({ name: name, content: content });
  }
  return result;
}

// スプシ貼り付け用TSV行（元ツールのcopyAllCharsTSVと同じ整形ルール）
function characterBlocksToRows_(blocks) {
  var rows = [];
  for (var i = 0; i < blocks.length; i++) {
    var cleaned = blocks[i].content
      .replace(/===\s*CHAR:[^\n]*===\s*/g, '')
      .replace(/---END---/g, '')
      .trim()
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    rows.push(cleaned);
  }
  return rows;
}
