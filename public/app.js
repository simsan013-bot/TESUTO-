// =====================================================
// STATE
// =====================================================
const state = {
  step: 1,
  character: {
    description: '',
    prompt: '',
    imageBase64: null,
    imageMimeType: 'image/png',
  },
  sceneCount: 200,
  scenario: '',
  scenes: [],          // [{ sceneNumber, sceneText, imagePrompt, imageBase64, imageMimeType, status }]
  isGenerating: false, // whether batch generation is in progress
  stopGeneration: false,
};

// =====================================================
// API HELPERS
// =====================================================
async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function generateCharacterPrompt(description) {
  const data = await api('/api/character/prompt', { description });
  return data.prompt;
}

async function generateImage(prompt, aspectRatio = '1:1') {
  const data = await api('/api/image/generate', { prompt, aspectRatio });
  return data; // { image, mimeType }
}

async function splitScenario(scenario, sceneCount, characterRef) {
  const data = await api('/api/scenario/split', { scenario, sceneCount, characterRef });
  return data.scenes;
}

// =====================================================
// NAVIGATION
// =====================================================
function goToStep(step) {
  state.step = step;
  renderApp();
}

// =====================================================
// STEP 1: CHARACTER SETUP
// =====================================================
function renderStep1() {
  const char = state.character;
  return `
    <div class="section-title">キャラクター設定</div>
    <p class="section-desc">キャラクターの詳細を入力して、画像を生成します。</p>

    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-title">キャラクター情報</div>
          <label>キャラクター詳細（名前・外見・服装・髪型・性格など）</label>
          <textarea id="charDesc" class="textarea-lg" placeholder="例：田中ハルカ、17歳の女子高生。長い黒髪でサイドポニーテール。清楚な白いセーラー服。青い瞳。明るく元気な性格。...">${char.description}</textarea>
          <div class="char-count" id="charDescCount">${char.description.length} 文字</div>

          <div class="btn-group">
            <button class="btn btn-primary" id="btnGenPrompt">
              <span>✨</span> プロンプト生成
            </button>
          </div>
        </div>

        ${char.prompt ? `
        <div class="card">
          <div class="card-title">生成プロンプト（編集可能）</div>
          <textarea id="charPrompt" rows="5">${char.prompt}</textarea>
          <div class="btn-group">
            <button class="btn btn-primary" id="btnGenCharImage">
              <span>🎨</span> 画像を生成
            </button>
            <button class="btn btn-secondary" id="btnSavePrompt">
              <span>💾</span> プロンプト保存
            </button>
          </div>
        </div>
        ` : ''}
      </div>

      <div>
        <div class="card">
          <div class="card-title">キャラクター画像</div>
          <div class="image-preview" id="charImagePreview">
            ${char.imageBase64
              ? `<img src="data:${char.imageMimeType};base64,${char.imageBase64}" alt="Character">`
              : `<div class="image-preview-placeholder">
                  <div style="font-size:48px;margin-bottom:8px">👤</div>
                  <div>プロンプトを生成して<br>画像を生成してください</div>
                </div>`
            }
          </div>

          ${char.imageBase64 ? `
          <div class="btn-group">
            <button class="btn btn-success btn-lg" id="btnUseCharacter">
              このキャラクターを使用 →
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    </div>

    <div id="step1Error"></div>
  `;
}

function attachStep1Events() {
  const descEl = document.getElementById('charDesc');
  const countEl = document.getElementById('charDescCount');
  if (descEl && countEl) {
    descEl.addEventListener('input', () => {
      state.character.description = descEl.value;
      countEl.textContent = `${descEl.value.length} 文字`;
    });
  }

  const btnGenPrompt = document.getElementById('btnGenPrompt');
  if (btnGenPrompt) {
    btnGenPrompt.addEventListener('click', async () => {
      const desc = document.getElementById('charDesc').value.trim();
      if (!desc) { showStep1Error('キャラクター詳細を入力してください。'); return; }

      setLoading(btnGenPrompt, true, 'プロンプト生成中...');
      clearStep1Error();
      try {
        const prompt = await generateCharacterPrompt(desc);
        state.character.description = desc;
        state.character.prompt = prompt;
        renderApp();
      } catch (err) {
        showStep1Error(err.message);
      } finally {
        setLoading(btnGenPrompt, false, '✨ プロンプト生成');
      }
    });
  }

  const btnSavePrompt = document.getElementById('btnSavePrompt');
  if (btnSavePrompt) {
    btnSavePrompt.addEventListener('click', () => {
      const p = document.getElementById('charPrompt').value.trim();
      state.character.prompt = p;
      showStep1Success('プロンプトを保存しました。');
    });
  }

  const btnGenCharImage = document.getElementById('btnGenCharImage');
  if (btnGenCharImage) {
    btnGenCharImage.addEventListener('click', async () => {
      const p = document.getElementById('charPrompt').value.trim();
      if (!p) { showStep1Error('プロンプトを入力してください。'); return; }

      state.character.prompt = p;
      setLoading(btnGenCharImage, true, '画像生成中...');
      clearStep1Error();

      const preview = document.getElementById('charImagePreview');
      if (preview) {
        preview.innerHTML = `<div class="image-preview-placeholder">
          <div class="spinner spinner-lg"></div>
          <div style="margin-top:8px;font-size:11px">生成中...</div>
        </div>`;
      }

      try {
        const result = await generateImage(p, '1:1');
        state.character.imageBase64 = result.image;
        state.character.imageMimeType = result.mimeType || 'image/png';
        renderApp();
      } catch (err) {
        showStep1Error(err.message);
        if (preview) {
          preview.innerHTML = `<div class="image-preview-placeholder"><div>⚠️ 生成失敗</div></div>`;
        }
      } finally {
        setLoading(btnGenCharImage, false, '🎨 画像を生成');
      }
    });
  }

  const btnUseCharacter = document.getElementById('btnUseCharacter');
  if (btnUseCharacter) {
    btnUseCharacter.addEventListener('click', () => {
      goToStep(2);
    });
  }
}

function showStep1Error(msg) {
  const el = document.getElementById('step1Error');
  if (el) el.innerHTML = `<div class="alert alert-error">⚠️ ${msg}</div>`;
}
function showStep1Success(msg) {
  const el = document.getElementById('step1Error');
  if (el) el.innerHTML = `<div class="alert alert-success">✅ ${msg}</div>`;
}
function clearStep1Error() {
  const el = document.getElementById('step1Error');
  if (el) el.innerHTML = '';
}

// =====================================================
// STEP 2: SCENARIO INPUT
// =====================================================
function renderStep2() {
  const charPreview = state.character.imageBase64
    ? `<img src="data:${state.character.imageMimeType};base64,${state.character.imageBase64}"
         style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--accent);">`
    : '<div style="width:48px;height:48px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:20px">👤</div>';

  return `
    <div class="section-title">シナリオ入力</div>
    <p class="section-desc">シナリオを入力して、均等にシーン分割します。</p>

    <div class="card mb-4">
      <div class="card-title">使用キャラクター</div>
      <div style="display:flex;align-items:center;gap:12px;">
        ${charPreview}
        <div>
          <div style="font-size:13px;font-weight:600">${state.character.description.substring(0,60)}...</div>
          <div style="font-size:11px;color:var(--text3)">このキャラクターが全シーンに登場します</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="btnBackToChar">← 変更</button>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-title">シーン数の選択</div>
      <div class="scene-count-wrap">
        <div class="scene-count-opt ${state.sceneCount === 150 ? 'selected' : ''}" data-count="150">
          <div class="count-num">150</div>
          <div class="count-label">シーン</div>
        </div>
        <div class="scene-count-opt ${state.sceneCount === 200 ? 'selected' : ''}" data-count="200">
          <div class="count-num">200</div>
          <div class="count-label">シーン</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">シナリオ</div>
      <label>シナリオテキスト（小説・脚本・物語など）</label>
      <textarea id="scenarioText" class="textarea-lg" style="min-height:400px"
        placeholder="シナリオを貼り付けてください...">${state.scenario}</textarea>
      <div class="char-count" id="scenarioCount">${state.scenario.length} 文字</div>

      <div class="btn-group">
        <button class="btn btn-primary btn-lg" id="btnSplitScenario">
          <span>✂️</span> シーン分割 &amp; プロンプト生成
        </button>
      </div>
      <div id="step2Error"></div>
    </div>
  `;
}

function attachStep2Events() {
  const textEl = document.getElementById('scenarioText');
  const countEl = document.getElementById('scenarioCount');
  if (textEl && countEl) {
    textEl.addEventListener('input', () => {
      state.scenario = textEl.value;
      countEl.textContent = `${textEl.value.length} 文字`;
    });
  }

  document.querySelectorAll('.scene-count-opt').forEach(el => {
    el.addEventListener('click', () => {
      state.sceneCount = parseInt(el.dataset.count);
      document.querySelectorAll('.scene-count-opt').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  const btnBack = document.getElementById('btnBackToChar');
  if (btnBack) btnBack.addEventListener('click', () => goToStep(1));

  const btnSplit = document.getElementById('btnSplitScenario');
  if (btnSplit) {
    btnSplit.addEventListener('click', async () => {
      const text = document.getElementById('scenarioText').value.trim();
      if (!text) {
        document.getElementById('step2Error').innerHTML =
          `<div class="alert alert-error mt-4">⚠️ シナリオを入力してください。</div>`;
        return;
      }
      state.scenario = text;
      setLoading(btnSplit, true, `${state.sceneCount}シーンに分割中... (時間がかかる場合があります)`);
      document.getElementById('step2Error').innerHTML =
        `<div class="alert alert-info mt-4" style="margin-top:12px">
          <div class="spinner"></div>
          Geminiがシナリオを分析中... ${state.sceneCount}シーン分のプロンプトを生成しています
        </div>`;

      try {
        const characterRef = `${state.character.description}\n\nCharacter image prompt: ${state.character.prompt}`;
        const scenes = await splitScenario(text, state.sceneCount, characterRef);
        state.scenes = scenes.map(s => ({
          sceneNumber: s.sceneNumber,
          sceneText: s.sceneText,
          imagePrompt: s.imagePrompt,
          imageBase64: null,
          imageMimeType: 'image/png',
          status: 'pending', // pending | generating | done | error
          errorMsg: null,
        }));
        goToStep(3);
      } catch (err) {
        document.getElementById('step2Error').innerHTML =
          `<div class="alert alert-error mt-4">⚠️ ${err.message}</div>`;
      } finally {
        setLoading(btnSplit, false, `✂️ シーン分割 & プロンプト生成`);
      }
    });
  }
}

// =====================================================
// STEP 3: SCENE GENERATION
// =====================================================
function renderStep3() {
  const total = state.scenes.length;
  const done = state.scenes.filter(s => s.status === 'done').length;
  const errors = state.scenes.filter(s => s.status === 'error').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return `
    <div class="section-title">シーン画像生成</div>
    <p class="section-desc">各シーンの確認・プロンプト編集・画像生成を行います。</p>

    <div class="card mb-4">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:13px;color:var(--text2)">
            生成済み: <strong style="color:var(--success)">${done}</strong> / ${total}
            ${errors > 0 ? `&nbsp;エラー: <strong style="color:var(--error)">${errors}</strong>` : ''}
          </div>
          <div class="progress-wrap" style="margin-top:8px;min-width:200px">
            <div class="progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${!state.isGenerating ? `
            <button class="btn btn-primary" id="btnGenerateAll">
              🚀 全シーン画像を生成
            </button>
            ${errors > 0 ? `
            <button class="btn btn-warning" id="btnRetryErrors">
              🔄 エラーを再試行
            </button>` : ''}
          ` : `
            <button class="btn btn-danger" id="btnStopGeneration">
              ⏹ 停止
            </button>
          `}
          ${done > 0 ? `
          <button class="btn btn-success" id="btnGoDownload">
            📦 ダウンロードへ →
          </button>` : ''}
        </div>
      </div>
    </div>

    <div class="scene-grid" id="sceneGrid">
      ${state.scenes.map(s => renderSceneCard(s)).join('')}
    </div>
  `;
}

function renderSceneCard(scene) {
  let thumbContent = '';
  if (scene.status === 'generating') {
    thumbContent = `
      <div class="thumb-placeholder">
        <div class="spinner"></div>
      </div>`;
  } else if (scene.status === 'done' && scene.imageBase64) {
    thumbContent = `<img src="data:${scene.imageMimeType};base64,${scene.imageBase64}" alt="Scene ${scene.sceneNumber}" loading="lazy">`;
  } else if (scene.status === 'error') {
    thumbContent = `
      <div class="thumb-placeholder">
        <div style="font-size:24px">⚠️</div>
        <div>${scene.errorMsg ? scene.errorMsg.substring(0,30) : 'エラー'}</div>
      </div>`;
  } else {
    thumbContent = `
      <div class="thumb-placeholder">
        <div style="font-size:20px">🖼️</div>
        <div>未生成</div>
      </div>`;
  }

  return `
    <div class="scene-card status-${scene.status}" id="scene-card-${scene.sceneNumber}">
      <div class="scene-thumb">${thumbContent}</div>
      <div class="scene-info">
        <div class="scene-num">シーン ${scene.sceneNumber}</div>
        <div class="status-badge ${scene.status}">
          ${{ pending: '待機', generating: '生成中', done: '完了', error: 'エラー' }[scene.status]}
        </div>
        <div class="scene-text-preview">${scene.sceneText || ''}</div>
      </div>
      <div class="scene-actions">
        <button class="btn btn-secondary btn-sm" onclick="openSceneModal(${scene.sceneNumber})">
          ✏️ 編集
        </button>
        <button class="btn btn-primary btn-sm" onclick="regenerateScene(${scene.sceneNumber})"
          ${scene.status === 'generating' ? 'disabled' : ''}>
          🔄
        </button>
      </div>
    </div>
  `;
}

function updateSceneCardDOM(scene) {
  const el = document.getElementById(`scene-card-${scene.sceneNumber}`);
  if (!el) return;
  el.outerHTML = renderSceneCard(scene);
}

function attachStep3Events() {
  const btnGenerateAll = document.getElementById('btnGenerateAll');
  if (btnGenerateAll) {
    btnGenerateAll.addEventListener('click', startBatchGeneration);
  }

  const btnRetryErrors = document.getElementById('btnRetryErrors');
  if (btnRetryErrors) {
    btnRetryErrors.addEventListener('click', () => {
      state.scenes.forEach(s => { if (s.status === 'error') s.status = 'pending'; });
      startBatchGeneration();
    });
  }

  const btnStop = document.getElementById('btnStopGeneration');
  if (btnStop) {
    btnStop.addEventListener('click', () => {
      state.stopGeneration = true;
    });
  }

  const btnGoDownload = document.getElementById('btnGoDownload');
  if (btnGoDownload) {
    btnGoDownload.addEventListener('click', () => goToStep(4));
  }
}

async function startBatchGeneration() {
  if (state.isGenerating) return;
  state.isGenerating = true;
  state.stopGeneration = false;
  renderApp();

  const pending = state.scenes.filter(s => s.status === 'pending');

  for (const scene of pending) {
    if (state.stopGeneration) break;

    scene.status = 'generating';
    updateSceneCardDOM(scene);
    updateProgressBar();

    try {
      const result = await generateImage(scene.imagePrompt, '16:9');
      scene.imageBase64 = result.image;
      scene.imageMimeType = result.mimeType || 'image/png';
      scene.status = 'done';
    } catch (err) {
      scene.status = 'error';
      scene.errorMsg = err.message;
    }

    updateSceneCardDOM(scene);
    updateProgressBar();

    // Small delay to avoid rate limits
    await sleep(300);
  }

  state.isGenerating = false;
  renderApp();
}

function updateProgressBar() {
  const total = state.scenes.length;
  const done = state.scenes.filter(s => s.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Update the card at top of step 3
  const barEl = document.querySelector('.progress-bar');
  if (barEl) barEl.style.width = `${pct}%`;

  const doneEl = document.querySelector('[data-done-count]');
  if (doneEl) doneEl.textContent = done;
}

// =====================================================
// SCENE MODAL (edit & regenerate)
// =====================================================
window.openSceneModal = function(sceneNumber) {
  const scene = state.scenes.find(s => s.sceneNumber === sceneNumber);
  if (!scene) return;

  const overlay = document.getElementById('modalOverlay');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');

  title.textContent = `シーン ${sceneNumber} - プロンプト編集`;

  body.innerHTML = `
    ${scene.imageBase64
      ? `<img class="modal-scene-thumb" src="data:${scene.imageMimeType};base64,${scene.imageBase64}" alt="Scene">`
      : `<div style="background:var(--bg3);height:120px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text3);margin-bottom:16px">未生成</div>`
    }

    <div class="mb-4">
      <label>シーン説明</label>
      <textarea id="modalSceneText" rows="3">${scene.sceneText}</textarea>
    </div>

    <div class="mb-4">
      <label>画像生成プロンプト（英語）</label>
      <textarea id="modalPrompt" rows="5">${scene.imagePrompt}</textarea>
    </div>

    <div id="modalError"></div>

    <div class="btn-group">
      <button class="btn btn-primary" id="modalBtnRegen">
        🎨 この内容で再生成
      </button>
      <button class="btn btn-secondary" id="modalBtnSave">
        💾 保存のみ
      </button>
    </div>
  `;

  overlay.style.display = 'flex';

  document.getElementById('modalBtnSave').addEventListener('click', () => {
    scene.sceneText = document.getElementById('modalSceneText').value.trim();
    scene.imagePrompt = document.getElementById('modalPrompt').value.trim();
    closeModal();
    updateSceneCardDOM(scene);
  });

  document.getElementById('modalBtnRegen').addEventListener('click', async () => {
    const newText = document.getElementById('modalSceneText').value.trim();
    const newPrompt = document.getElementById('modalPrompt').value.trim();
    if (!newPrompt) {
      document.getElementById('modalError').innerHTML = `<div class="alert alert-error">プロンプトを入力してください。</div>`;
      return;
    }

    scene.sceneText = newText;
    scene.imagePrompt = newPrompt;
    scene.status = 'generating';
    closeModal();
    updateSceneCardDOM(scene);

    try {
      const result = await generateImage(newPrompt, '16:9');
      scene.imageBase64 = result.image;
      scene.imageMimeType = result.mimeType || 'image/png';
      scene.status = 'done';
    } catch (err) {
      scene.status = 'error';
      scene.errorMsg = err.message;
    }

    updateSceneCardDOM(scene);
    updateProgressBar();
  });
};

window.regenerateScene = async function(sceneNumber) {
  const scene = state.scenes.find(s => s.sceneNumber === sceneNumber);
  if (!scene || scene.status === 'generating') return;

  scene.status = 'generating';
  updateSceneCardDOM(scene);

  try {
    const result = await generateImage(scene.imagePrompt, '16:9');
    scene.imageBase64 = result.image;
    scene.imageMimeType = result.mimeType || 'image/png';
    scene.status = 'done';
  } catch (err) {
    scene.status = 'error';
    scene.errorMsg = err.message;
  }

  updateSceneCardDOM(scene);
  updateProgressBar();
};

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// =====================================================
// STEP 4: DOWNLOAD
// =====================================================
function renderStep4() {
  const total = state.scenes.length;
  const done = state.scenes.filter(s => s.status === 'done').length;
  const hasChar = !!state.character.imageBase64;

  return `
    <div class="section-title">ダウンロード</div>
    <p class="section-desc">生成した全画像を一括ダウンロードできます。</p>

    <div class="download-summary">
      <div class="stat-card">
        <div class="stat-num">${hasChar ? 1 : 0}</div>
        <div class="stat-label">キャラクター画像</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${done}</div>
        <div class="stat-label">シーン画像（完了）</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${total - done}</div>
        <div class="stat-label">未生成シーン</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${done + (hasChar ? 1 : 0)}</div>
        <div class="stat-label">合計ダウンロード数</div>
      </div>
    </div>

    <div class="download-options">
      <div class="download-option">
        <div class="download-option-info">
          <h4>📦 全画像を一括ダウンロード (ZIP)</h4>
          <p>キャラクター画像 + 全シーン画像をまとめてダウンロードします</p>
        </div>
        <button class="btn btn-success btn-lg" id="btnDownloadAll">
          ⬇️ ZIPダウンロード
        </button>
      </div>

      ${hasChar ? `
      <div class="download-option">
        <div class="download-option-info">
          <h4>👤 キャラクター画像のみ</h4>
          <p>キャラクター画像を単体でダウンロードします</p>
        </div>
        <button class="btn btn-secondary" id="btnDownloadChar">
          ⬇️ ダウンロード
        </button>
      </div>` : ''}

      ${done > 0 ? `
      <div class="download-option">
        <div class="download-option-info">
          <h4>🎬 シーン画像のみ (ZIP)</h4>
          <p>完了したシーン画像 ${done}枚 をまとめてダウンロードします</p>
        </div>
        <button class="btn btn-secondary" id="btnDownloadScenes">
          ⬇️ ZIPダウンロード
        </button>
      </div>` : ''}
    </div>

    <div id="downloadError" style="margin-top:16px"></div>

    <div class="btn-group" style="margin-top:24px">
      <button class="btn btn-secondary" onclick="goToStep(3)">
        ← シーン一覧に戻る
      </button>
    </div>
  `;
}

function attachStep4Events() {
  const btnAll = document.getElementById('btnDownloadAll');
  if (btnAll) {
    btnAll.addEventListener('click', async () => {
      setLoading(btnAll, true, 'ZIP作成中...');
      try {
        await downloadAllAsZip(true, true);
      } catch (err) {
        document.getElementById('downloadError').innerHTML =
          `<div class="alert alert-error">⚠️ ${err.message}</div>`;
      } finally {
        setLoading(btnAll, false, '⬇️ ZIPダウンロード');
      }
    });
  }

  const btnChar = document.getElementById('btnDownloadChar');
  if (btnChar) {
    btnChar.addEventListener('click', () => {
      downloadSingleImage(
        state.character.imageBase64,
        state.character.imageMimeType,
        'character.png'
      );
    });
  }

  const btnScenes = document.getElementById('btnDownloadScenes');
  if (btnScenes) {
    btnScenes.addEventListener('click', async () => {
      setLoading(btnScenes, true, 'ZIP作成中...');
      try {
        await downloadAllAsZip(false, true);
      } catch (err) {
        document.getElementById('downloadError').innerHTML =
          `<div class="alert alert-error">⚠️ ${err.message}</div>`;
      } finally {
        setLoading(btnScenes, false, '⬇️ ZIPダウンロード');
      }
    });
  }
}

async function downloadAllAsZip(includeCharacter, includeScenes) {
  const zip = new JSZip();

  if (includeCharacter && state.character.imageBase64) {
    const ext = mimeToExt(state.character.imageMimeType);
    zip.file(`character/character.${ext}`, state.character.imageBase64, { base64: true });
  }

  if (includeScenes) {
    const folder = zip.folder('scenes');
    const done = state.scenes.filter(s => s.status === 'done');
    done.forEach(scene => {
      const ext = mimeToExt(scene.imageMimeType);
      const num = String(scene.sceneNumber).padStart(3, '0');
      folder.file(`scene_${num}.${ext}`, scene.imageBase64, { base64: true });
    });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `nano-banana-images-${Date.now()}.zip`);
}

function downloadSingleImage(base64, mimeType, filename) {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64}`;
  link.download = filename;
  link.click();
}

function mimeToExt(mimeType) {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  return map[mimeType] || 'png';
}

// =====================================================
// MAIN RENDER
// =====================================================
function renderApp() {
  const app = document.getElementById('app');

  // Update step nav
  document.querySelectorAll('.step-item').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.className = 'step-item' +
      (s === state.step ? ' active' : s < state.step ? ' done' : '');
  });

  // Allow navigating back to completed steps
  document.querySelectorAll('.step-item.done').forEach(el => {
    el.addEventListener('click', () => {
      const s = parseInt(el.dataset.step);
      if (s < state.step && !state.isGenerating) goToStep(s);
    });
  });

  switch (state.step) {
    case 1: app.innerHTML = renderStep1(); attachStep1Events(); break;
    case 2: app.innerHTML = renderStep2(); attachStep2Events(); break;
    case 3: app.innerHTML = renderStep3(); attachStep3Events(); break;
    case 4: app.innerHTML = renderStep4(); attachStep4Events(); break;
  }
}

// =====================================================
// UTILITIES
// =====================================================
function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<div class="spinner"></div> ${text}`;
  } else {
    btn.textContent = text;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// MODAL CLOSE
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  renderApp();
});
