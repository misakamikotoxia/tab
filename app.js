// ===== 工具函数：防抖和节流 =====
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function throttle(fn, limit) {
    let inThrottle = false;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ===== IndexedDB Manager =====
const IDB = {
    db: null,
    init: function() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB 不可用，将使用降级模式');
                resolve();
                return;
            }
            const request = indexedDB.open('StartPageDB', 2);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('icons')) {
                    db.createObjectStore('icons', { keyPath: 'url' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                // 监听数据库连接错误
                this.db.onerror = (event) => {
                    console.error('数据库错误:', event.target.error);
                };
                resolve();
            };
            request.onerror = (e) => {
                console.error('IndexedDB 初始化失败:', e.target.error);
                resolve(); // 降级处理，不阻塞应用
            };
        });
    },
    getAll: function() {
        return new Promise((resolve) => {
            if(!this.db) return resolve([]);
            try {
                const tx = this.db.transaction('images', 'readonly');
                const req = tx.objectStore('images').getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch(e) {
                console.error('获取数据失败:', e);
                resolve([]);
            }
        });
    },
    add: function(item) {
        return new Promise((resolve, reject) => {
            if(!this.db) return reject(new Error('数据库未初始化'));
            try {
                const tx = this.db.transaction('images', 'readwrite');
                const req = tx.objectStore('images').add(item);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => {
                    console.error('添加数据失败:', e.target.error);
                    reject(e.target.error);
                };
            } catch(e) {
                console.error('添加数据失败:', e);
                reject(e);
            }
        });
    },
    update: function(item) {
        return new Promise((resolve, reject) => {
            if(!this.db) return reject(new Error('数据库未初始化'));
            try {
                const tx = this.db.transaction('images', 'readwrite');
                tx.objectStore('images').put(item);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => {
                    console.error('更新数据失败:', e.target.error);
                    reject(e.target.error);
                };
            } catch(e) {
                console.error('更新数据失败:', e);
                reject(e);
            }
        });
    },
    delete: function(id) {
        return new Promise((resolve, reject) => {
            if(!this.db) return reject(new Error('数据库未初始化'));
            try {
                const tx = this.db.transaction('images', 'readwrite');
                tx.objectStore('images').delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => {
                    console.error('删除数据失败:', e.target.error);
                    reject(e.target.error);
                };
            } catch(e) {
                console.error('删除数据失败:', e);
                reject(e);
            }
        });
    },
    clear: function() {
        return new Promise((resolve, reject) => {
            if(!this.db) return resolve();
            try {
                const tx = this.db.transaction('images', 'readwrite');
                tx.objectStore('images').clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => {
                    console.error('清除数据失败:', e.target.error);
                    reject(e.target.error);
                };
            } catch(e) {
                console.error('清除数据失败:', e);
                reject(e);
            }
        });
    },
    getIcon: function(url) {
        return new Promise((resolve) => {
            if(!this.db) return resolve(null);
            try {
                const tx = this.db.transaction('icons', 'readonly');
                const req = tx.objectStore('icons').get(url);
                req.onsuccess = () => resolve(req.result ? req.result.data : null);
                req.onerror = () => resolve(null);
            } catch(e) {
                resolve(null);
            }
        });
    },
    putIcon: function(url, data) {
        return new Promise((resolve) => {
            if(!this.db) return resolve();
            try {
                const tx = this.db.transaction('icons', 'readwrite');
                tx.objectStore('icons').put({ url: url, data: data });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch(e) {
                resolve();
            }
        });
    }
};

// ===== LocalStorage 工具 =====
const LS = {
    get: (k, d) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch{ return d; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

// ===== 全局状态 =====
let shortcuts = LS.get('shortcuts', [
    { name: 'GitHub', url: 'https://github.com', key: 'g', emoji: '🐙' },
    { name: 'Bilibili', url: 'https://www.bilibili.com', key: 'b', emoji: '📱' }
]);

let bgList = [];
let activeBgIndex = -1;
let globalSettings = LS.get('globalDisplay', { blur: 0, brightness: 100, overlay: 0.2 });
let isMinimal = false;
let uploadQueue = [];
let totalUploads = 0;
let cropper = null;
let ctxMenuIndex = -1;

// ===== 主初始化函数 =====
async function init() {
    await IDB.init();

    // 迁移：检查旧版 localStorage 数据
    const legacyBg = LS.get('bgList', []);
    if(legacyBg.length > 0) {
        console.log('Migrating legacy images to IDB...');
        for(let bg of legacyBg) {
            const data = (typeof bg === 'string') ? bg : bg.src;
            const settings = (typeof bg === 'object' && bg.settings) ? bg.settings : { ...globalSettings };
            await IDB.add({ data, settings });
        }
        localStorage.removeItem('bgList');
    }

    bgList = await IDB.getAll();
    await renderShortcuts();
    renderBgGallery();

    if (bgList.length > 0) {
        const rnd = Math.floor(Math.random() * bgList.length);
        applyBackground(rnd);
    } else {
        updateDisplayUI(globalSettings);
    }

    const pCont = document.getElementById('particles');
    for(let i=0; i<30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random()*100+'%';
        p.style.animationDelay = Math.random()*15+'s';
        pCont.appendChild(p);
    }

    const eng = localStorage.getItem('searchEngine');
    if(eng) document.getElementById('searchEngine').value = eng;
    document.getElementById('searchEngine').onchange = (e) => localStorage.setItem('searchEngine', e.target.value);
}

// ===== 背景管理逻辑 =====
function applyBackground(index) {
    const img = document.getElementById('customBackground');
    const items = document.querySelectorAll('.bg-image-item');
    items.forEach(i => i.classList.remove('active'));

    if (index >= 0 && index < bgList.length) {
        activeBgIndex = index;
        const bg = bgList[index];
        img.src = bg.data;
        img.classList.add('visible');
        document.body.classList.add('has-background');

        const s = bg.settings || { blur: 0, brightness: 100, overlay: 0.2 };
        updateDisplayUI(s);
        if (items[index]) items[index].classList.add('active');
    } else {
        activeBgIndex = -1;
        img.src = '';
        img.classList.remove('visible');
        document.body.classList.remove('has-background');
        updateDisplayUI(globalSettings);
    }
}

function changeRandomBackground() {
    if (bgList.length === 0) return;
    if (bgList.length === 1) {
        applyBackground(0);
        return;
    }

    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * bgList.length);
    } while (newIndex === activeBgIndex);

    applyBackground(newIndex);

    const h = document.getElementById('keyboardHint');
    h.innerHTML = '🎲 已切换背景';
    h.classList.add('visible');
    setTimeout(() => h.classList.remove('visible'), 1000);
}

function updateDisplayUI(s) {
    const r = document.documentElement.style;
    r.setProperty('--bg-blur', s.blur + 'px');
    r.setProperty('--bg-brightness', s.brightness + '%');
    r.setProperty('--bg-overlay-opacity', s.overlay);

    document.getElementById('bgBlurInput').value = s.blur;
    document.getElementById('val-blur').innerText = s.blur + 'px';
    document.getElementById('bgBrightnessInput').value = s.brightness;
    document.getElementById('val-brightness').innerText = s.brightness + '%';
    document.getElementById('bgOverlayInput').value = s.overlay;
    document.getElementById('val-overlay').innerText = Math.round(s.overlay * 100) + '%';
}

function onSliderChange() {
    const s = {
        blur: parseInt(document.getElementById('bgBlurInput').value),
        brightness: parseInt(document.getElementById('bgBrightnessInput').value),
        overlay: parseFloat(document.getElementById('bgOverlayInput').value)
    };
    updateDisplayUI(s);
    if (activeBgIndex >= 0 && bgList[activeBgIndex]) {
        bgList[activeBgIndex].settings = s;
        IDB.update(bgList[activeBgIndex]);
    } else {
        globalSettings = s;
        LS.set('globalDisplay', globalSettings);
    }
}

function renderBgGallery() {
    const div = document.getElementById('bgImageList');
    div.innerHTML = bgList.map((bg, i) => `
        <div class="bg-image-item ${i === activeBgIndex ? 'active' : ''}" onclick="applyBackground(${i})">
            <img src="${bg.data}" class="bg-image-item-thumb">
            <button class="bg-image-item-delete" onclick="deleteBg(${i}); event.stopPropagation()">×</button>
        </div>
    `).join('');
}

async function deleteBg(i) {
    if (!confirm('删除此背景？')) return;
    await IDB.delete(bgList[i].id);
    bgList.splice(i, 1);
    renderBgGallery();
    if (activeBgIndex === i) applyBackground(-1);
    else if (activeBgIndex > i) activeBgIndex--;
}

async function clearAllBackgrounds() {
    if(confirm('清除所有背景图？')) {
        await IDB.clear();
        bgList = [];
        renderBgGallery();
        applyBackground(-1);
    }
}

// ===== 工具函数 =====
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function showToast(message, type = 'info') {
    const h = document.getElementById('keyboardHint');
    h.innerHTML = type === 'error' ? `❌ ${message}` : `✅ ${message}`;
    h.classList.add('visible');
    setTimeout(() => h.classList.remove('visible'), 2000);
}

// ===== 图片添加功能 =====
async function addBackgroundFromUrl() {
    const url = document.getElementById('backgroundUrlInput').value.trim();
    if (!url) {
        showToast('请输入图片 URL', 'error');
        return;
    }
    if (!isValidUrl(url)) {
        showToast('请输入有效的 URL', 'error');
        return;
    }
    const newItem = { data: url, settings: { ...globalSettings } };
    const id = await IDB.add(newItem);
    newItem.id = id;
    bgList.push(newItem);
    renderBgGallery();
    document.getElementById('backgroundUrlInput').value = '';
    showToast('背景已添加');
    if(bgList.length === 1) applyBackground(0);
}

function uploadAndCropBackgrounds() {
    const files = document.getElementById('backgroundFiles').files;
    if(!files.length) return;
    uploadQueue = Array.from(files);
    totalUploads = uploadQueue.length;
    document.getElementById('backgroundFiles').value = '';
    document.getElementById('settingsPanel').classList.remove('open');
    processQueue();
}

function processQueue() {
    if(uploadQueue.length === 0) {
        document.getElementById('settingsPanel').classList.add('open');
        renderBgGallery();
        if (totalUploads > 0 && activeBgIndex === -1 && bgList.length > 0) applyBackground(bgList.length - 1);
        return;
    }
    const file = uploadQueue.shift();
    const reader = new FileReader();
    reader.onload = (e) => openCropper(e.target.result);
    reader.readAsDataURL(file);
}

function openCropper(src) {
    const title = document.getElementById('cropDialogTitle');
    title.innerText = `裁剪 (${totalUploads - uploadQueue.length}/${totalUploads})`;
    const img = document.getElementById('cropImage');
    img.src = src;

    const dialog = document.getElementById('cropDialog');
    dialog.classList.add('visible');
    dialog.setAttribute('aria-hidden', 'false');
    lastFocusedElement = document.activeElement;

    if(cropper) cropper.destroy();
    setTimeout(() => {
        cropper = new Cropper(img, {
            aspectRatio: window.innerWidth / window.innerHeight,
            viewMode: 1, dragMode: 'move', autoCropArea: 1
        });
        // 聚焦到确认按钮
        const confirmBtn = dialog.querySelector('.settings-btn-primary');
        if (confirmBtn) confirmBtn.focus();
    }, 100);
}

async function confirmCrop() {
    if(!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: 3840, height: 2160 });
    if(canvas) {
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        const newItem = { data: base64, settings: { ...globalSettings } };
        const id = await IDB.add(newItem);
        newItem.id = id;
        bgList.push(newItem);
    }
    closeCropper();
}

function skipAndProcessNext() { closeCropper(); }

function closeCropper() {
    if(cropper) { cropper.destroy(); cropper = null; }
    const dialog = document.getElementById('cropDialog');
    dialog.classList.remove('visible');
    dialog.setAttribute('aria-hidden', 'true');
    processQueue();
}

// ===== 导入/导出功能 =====
function exportData() {
    const data = {
        shortcuts: shortcuts,
        bgList: bgList,
        globalSettings: globalSettings,
        searchEngine: document.getElementById('searchEngine').value
    };
    try {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `startpage-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch(e) { alert('导出失败：数据量可能过大。'); }
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.shortcuts) LS.set('shortcuts', data.shortcuts);
            if (data.globalSettings) LS.set('globalDisplay', data.globalSettings);
            if (data.searchEngine) localStorage.setItem('searchEngine', data.searchEngine);
            if (data.bgList && Array.isArray(data.bgList)) {
                await IDB.clear();
                for (let bg of data.bgList) { delete bg.id; await IDB.add(bg); }
            }
            alert('导入成功！'); location.reload();
        } catch (err) { alert('导入失败：格式错误。'); }
    };
    reader.readAsText(file);
    input.value = '';
}

// ===== 快捷方式管理 =====
async function cacheAllIcons() {
    for (let s of shortcuts) {
        if (s.emoji) continue;
        try {
            const domain = new URL(s.url).origin;
            const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

            const cached = await IDB.getIcon(googleUrl);
            if (cached) continue;

            const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(googleUrl);
            const resp = await fetch(proxyUrl);
            if (resp.ok) {
                const blob = await resp.blob();
                const reader = new FileReader();
                reader.onloadend = async () => {
                    if(reader.result && reader.result.startsWith('data:')) {
                        await IDB.putIcon(googleUrl, reader.result);
                    }
                };
                reader.readAsDataURL(blob);
            }
        } catch (e) {
            console.warn('Icon cache failed', e);
        }
    }
}

async function renderShortcuts() {
    const htmlPromises = shortcuts.map(async (s, i) => {
        let iconSrc = '';
        if (s.emoji) {
            // Emoji
        } else {
            try {
                const domain = new URL(s.url).origin;
                const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                const cached = await IDB.getIcon(googleUrl);
                iconSrc = cached || googleUrl;
            } catch(e) { iconSrc = ''; }
        }

        // 生成首字母作为备用图标
        const initial = s.name.charAt(0).toUpperCase();
        // 转义 HTML 特殊字符
        const safeName = s.name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const safeUrl = s.url.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const keyHint = s.key ? ` (快捷键: ${s.key.toUpperCase()})` : '';

        return `
        <a href="${safeUrl}" class="shortcut" target="_blank" rel="noopener noreferrer" draggable="true" data-index="${i}"
           oncontextmenu="showCtxMenu(event, ${i}); return false;"
           aria-label="${safeName}${keyHint}"
           title="${safeName}${keyHint}">
            ${s.emoji ? `<span class="shortcut-icon" aria-hidden="true">${s.emoji}</span>` :
              `<span class="shortcut-icon shortcut-fallback" style="display:none" aria-hidden="true">${initial}</span>
               <img src="${iconSrc}" class="shortcut-favicon" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`}
            <span class="shortcut-name">${safeName}</span>
        </a>
        `;
    });

    const htmlItems = await Promise.all(htmlPromises);
    document.getElementById('shortcuts').innerHTML = htmlItems.join('');

    // 初始化拖拽排序
    initDragAndDrop();

    document.getElementById('shortcutsList').innerHTML = shortcuts.map((s, i) => `
        <div class="shortcut-item">
            <div class="shortcut-item-icon">${s.emoji || '🔗'}</div>
            <div class="shortcut-item-info">
                <div class="shortcut-item-name">${s.name}</div>
                <div class="shortcut-item-url">${s.url}</div>
            </div>
            ${s.key ? `<span class="shortcut-item-key">${s.key.toUpperCase()}</span>` : ''}
            <button class="shortcut-item-delete" onclick="delShortcut(${i})" title="删除">×</button>
        </div>
    `).join('');

    cacheAllIcons();
}

// ===== 拖拽排序功能 =====
let draggedIndex = null;

function initDragAndDrop() {
    const container = document.getElementById('shortcuts');
    const items = container.querySelectorAll('.shortcut');

    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedIndex);
    // 阻止链接跳转
    e.stopPropagation();
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.shortcut').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedIndex = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (parseInt(this.dataset.index) !== draggedIndex) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('drag-over');

    const targetIndex = parseInt(this.dataset.index);
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    // 重新排序数组
    const [removed] = shortcuts.splice(draggedIndex, 1);
    shortcuts.splice(targetIndex, 0, removed);

    // 保存并重新渲染
    LS.set('shortcuts', shortcuts);
    renderShortcuts();
    showToast('快捷方式已重新排序');
}

function showCtxMenu(e, i) {
    e.preventDefault(); ctxMenuIndex = i;
    const m = document.getElementById('contextMenu');
    m.style.left = Math.min(e.pageX, window.innerWidth - 150) + 'px';
    m.style.top = Math.min(e.pageY, window.innerHeight - 100) + 'px';
    m.classList.add('visible');
}

function delShortcut(i) {
    if(confirm('删除?')) {
        shortcuts.splice(i,1);
        LS.set('shortcuts', shortcuts);
        renderShortcuts();
    }
}

function deleteShortcutFromMenu() { delShortcut(ctxMenuIndex); }

function editShortcutFromMenu() {
    const s = shortcuts[ctxMenuIndex];
    document.getElementById('editIndex').value = ctxMenuIndex;
    document.getElementById('editName').value = s.name;
    document.getElementById('editUrl').value = s.url;
    document.getElementById('editKey').value = s.key || '';
    document.getElementById('editEmoji').value = s.emoji || '';

    const dialog = document.getElementById('editDialog');
    dialog.classList.add('visible');
    dialog.setAttribute('aria-hidden', 'false');
    lastFocusedElement = document.activeElement;
    // 聚焦到名称输入框
    document.getElementById('editName').focus();
}

// ===== UI 交互函数 =====
let lastFocusedElement = null;

// 焦点陷阱：确保焦点在对话框内循环
function trapFocus(dialog) {
    const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    dialog.addEventListener('keydown', function(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
                lastFocusable.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusable) {
                firstFocusable.focus();
                e.preventDefault();
            }
        }
    });
}

// 初始化所有对话框的焦点陷阱
document.addEventListener('DOMContentLoaded', () => {
    ['addDialog', 'editDialog', 'cropDialog'].forEach(id => {
        const dialog = document.getElementById(id);
        if (dialog) trapFocus(dialog);
    });
});

// ===== 设置弹窗控制 =====
function toggleSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay.classList.contains('open')) {
        closeSettingsModal();
    } else {
        openSettingsModal();
    }
}

function openSettingsModal() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.add('open');
    lastFocusedElement = document.activeElement;

    // 初始化导航点击事件
    initSettingsNav();
}

function closeSettingsModal(event) {
    // 如果点击的是遮罩层本身（不是弹窗内容）
    if (event && event.target !== event.currentTarget) return;

    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.remove('open');

    if (lastFocusedElement) {
        lastFocusedElement.focus();
    }
}

function initSettingsNav() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    const sections = document.querySelectorAll('.settings-section');

    navItems.forEach(item => {
        item.onclick = () => {
            const sectionId = item.dataset.section;

            // 更新导航激活状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 切换内容区域
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `section-${sectionId}`) {
                    section.classList.add('active');
                }
            });
        };
    });
}

// 显示模式：0=默认, 1=简洁, 2=歌词
let displayMode = 0;

function cycleDisplayMode() {
    // 循环切换：默认 -> 简洁 -> 歌词 -> 默认
    displayMode = (displayMode + 1) % 3;

    // 清除所有模式
    document.body.classList.remove('minimal-mode', 'lyrics-mode');
    if (typeof lyricsManager !== 'undefined' && lyricsManager) {
        lyricsManager.hide();
    }

    const btn = document.getElementById('modeToggle');
    const modeNames = ['默认模式', '简洁模式', '歌词模式'];
    const modeIcons = ['👁️', '🔲', '📝'];

    switch (displayMode) {
        case 0: // 默认模式
            isMinimal = false;
            break;
        case 1: // 简洁模式
            isMinimal = true;
            document.body.classList.add('minimal-mode');
            break;
        case 2: // 歌词模式
            isMinimal = false;
            document.body.classList.add('lyrics-mode');
            if (typeof lyricsManager !== 'undefined' && lyricsManager) {
                lyricsManager.show();
            }
            break;
    }

    // 更新按钮图标和状态
    if (btn) {
        btn.textContent = modeIcons[displayMode];
        btn.setAttribute('aria-pressed', displayMode > 0);
        btn.title = `切换模式 (M) - 当前: ${modeNames[displayMode]}`;
    }

    showToast(modeNames[displayMode]);
}

// 保留旧函数名以兼容
function toggleMinimalMode() {
    cycleDisplayMode();
}

function showAddDialog() {
    const dialog = document.getElementById('addDialog');
    dialog.classList.add('visible');
    dialog.setAttribute('aria-hidden', 'false');
    lastFocusedElement = document.activeElement;
    // 聚焦到第一个输入框
    const firstInput = dialog.querySelector('input');
    if (firstInput) firstInput.focus();
}

function closeAddDialog() {
    const dialog = document.getElementById('addDialog');
    dialog.classList.remove('visible');
    dialog.setAttribute('aria-hidden', 'true');
    if (lastFocusedElement) lastFocusedElement.focus();
}

function confirmAdd() {
    const name = document.getElementById('addName').value.trim();
    let url = document.getElementById('addUrl').value.trim();
    const key = document.getElementById('addKey').value.toLowerCase();
    const emoji = document.getElementById('addEmoji').value;

    if (!name) {
        showToast('请输入名称', 'error');
        return;
    }
    if (!url) {
        showToast('请输入网址', 'error');
        return;
    }
    // 自动补全 https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    if (!isValidUrl(url)) {
        showToast('请输入有效的网址', 'error');
        return;
    }

    shortcuts.push({ name, url, key, emoji });
    LS.set('shortcuts', shortcuts);
    renderShortcuts();
    closeAddDialog();
    showToast('快捷方式已添加');
    // 清空表单
    document.getElementById('addName').value = '';
    document.getElementById('addUrl').value = '';
    document.getElementById('addKey').value = '';
    document.getElementById('addEmoji').value = '';
}

function closeEditDialog() {
    const dialog = document.getElementById('editDialog');
    dialog.classList.remove('visible');
    dialog.setAttribute('aria-hidden', 'true');
    if (lastFocusedElement) lastFocusedElement.focus();
}

function confirmEdit() {
    const i = document.getElementById('editIndex').value;
    const name = document.getElementById('editName').value.trim();
    let url = document.getElementById('editUrl').value.trim();
    const key = document.getElementById('editKey').value.toLowerCase();
    const emoji = document.getElementById('editEmoji').value;

    if (!name) {
        showToast('请输入名称', 'error');
        return;
    }
    if (!url) {
        showToast('请输入网址', 'error');
        return;
    }
    // 自动补全 https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    if (!isValidUrl(url)) {
        showToast('请输入有效的网址', 'error');
        return;
    }

    shortcuts[i] = { name, url, key, emoji };
    LS.set('shortcuts', shortcuts);
    renderShortcuts();
    closeEditDialog();
    showToast('快捷方式已更新');
}

// ===== 事件监听器 =====
// 滑块变化监听（使用防抖优化性能）
const debouncedSliderSave = debounce(() => {
    const s = {
        blur: parseInt(document.getElementById('bgBlurInput').value),
        brightness: parseInt(document.getElementById('bgBrightnessInput').value),
        overlay: parseFloat(document.getElementById('bgOverlayInput').value)
    };
    if (activeBgIndex >= 0 && bgList[activeBgIndex]) {
        bgList[activeBgIndex].settings = s;
        IDB.update(bgList[activeBgIndex]);
    } else {
        globalSettings = s;
        LS.set('globalDisplay', globalSettings);
    }
}, 300);

function onSliderChangeOptimized() {
    const s = {
        blur: parseInt(document.getElementById('bgBlurInput').value),
        brightness: parseInt(document.getElementById('bgBrightnessInput').value),
        overlay: parseFloat(document.getElementById('bgOverlayInput').value)
    };
    updateDisplayUI(s);
    debouncedSliderSave();
}

['bgBlurInput', 'bgBrightnessInput', 'bgOverlayInput'].forEach(id =>
    document.getElementById(id).addEventListener('input', onSliderChangeOptimized)
);

// 点击关闭右键菜单
document.addEventListener('click', (e) => {
    if(!e.target.closest('.context-menu'))
        document.getElementById('contextMenu').classList.remove('visible');
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    if (e.key === '/') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
        return;
    }
    if (e.key === '?') {
        e.preventDefault();
        showKeyboardHelp();
        return;
    }
    if (e.key.toLowerCase() === 'm') {
        cycleDisplayMode();
        return;
    }
    if (e.key.toLowerCase() === 'r') {
        changeRandomBackground();
        return;
    }
    if (e.key.toLowerCase() === 'p') {
        toggleRhythmMode();
        return;
    }
    if (e.key === 'Escape') {
        // 关闭所有弹窗
        document.getElementById('settingsOverlay').classList.remove('open');
        document.getElementById('addDialog').classList.remove('visible');
        document.getElementById('editDialog').classList.remove('visible');
        document.getElementById('cropDialog').classList.remove('visible');
        document.getElementById('contextMenu').classList.remove('visible');
        document.getElementById('keyboardHelpDialog')?.classList.remove('visible');
        // 如果在歌词模式，按 Esc 返回默认模式
        if (displayMode === 2) {
            displayMode = 0;
            document.body.classList.remove('lyrics-mode');
            if (typeof lyricsManager !== 'undefined' && lyricsManager) {
                lyricsManager.hide();
            }
            const btn = document.getElementById('modeToggle');
            if (btn) {
                btn.textContent = '👁️';
                btn.setAttribute('aria-pressed', 'false');
            }
        }
        return;
    }
    const s = shortcuts.find(x => x.key === e.key.toLowerCase());
    if(s) window.open(s.url);
});

// 显示键盘快捷键帮助
function showKeyboardHelp() {
    let dialog = document.getElementById('keyboardHelpDialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'keyboardHelpDialog';
        dialog.className = 'edit-dialog';
        dialog.innerHTML = `
            <div class="edit-dialog-content" style="max-width: 500px;">
                <h3 class="edit-dialog-title">键盘快捷键</h3>
                <div class="keyboard-help-list">
                    <div class="keyboard-help-item"><kbd>/</kbd><span>聚焦搜索框</span></div>
                    <div class="keyboard-help-item"><kbd>R</kbd><span>随机切换背景</span></div>
                    <div class="keyboard-help-item"><kbd>M</kbd><span>切换模式 (默认/简洁/歌词)</span></div>
                    <div class="keyboard-help-item"><kbd>P</kbd><span>切换律动模式</span></div>
                    <div class="keyboard-help-item"><kbd>?</kbd><span>显示此帮助</span></div>
                    <div class="keyboard-help-item"><kbd>Esc</kbd><span>关闭弹窗/返回默认</span></div>
                    <div class="keyboard-help-divider"></div>
                    <div class="keyboard-help-subtitle">自定义快捷方式</div>
                    ${shortcuts.filter(s => s.key).map(s =>
                        `<div class="keyboard-help-item"><kbd>${s.key.toUpperCase()}</kbd><span>打开 ${s.name}</span></div>`
                    ).join('')}
                </div>
                <div class="settings-btn-group" style="margin-top: 1.5rem;">
                    <button class="settings-btn-primary" onclick="document.getElementById('keyboardHelpDialog').classList.remove('visible')">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    } else {
        // 更新快捷方式列表
        const list = dialog.querySelector('.keyboard-help-list');
        const customShortcuts = shortcuts.filter(s => s.key).map(s =>
            `<div class="keyboard-help-item"><kbd>${s.key.toUpperCase()}</kbd><span>打开 ${s.name}</span></div>`
        ).join('');
        list.innerHTML = `
            <div class="keyboard-help-item"><kbd>/</kbd><span>聚焦搜索框</span></div>
            <div class="keyboard-help-item"><kbd>R</kbd><span>随机切换背景</span></div>
            <div class="keyboard-help-item"><kbd>M</kbd><span>切换模式 (默认/简洁/歌词)</span></div>
            <div class="keyboard-help-item"><kbd>P</kbd><span>切换律动模式</span></div>
            <div class="keyboard-help-item"><kbd>?</kbd><span>显示此帮助</span></div>
            <div class="keyboard-help-item"><kbd>Esc</kbd><span>关闭弹窗/返回默认</span></div>
            <div class="keyboard-help-divider"></div>
            <div class="keyboard-help-subtitle">自定义快捷方式</div>
            ${customShortcuts}
        `;
    }
    dialog.classList.add('visible');
}

// ===== 搜索历史功能 =====
const MAX_SEARCH_HISTORY = 10;
let searchHistory = LS.get('searchHistory', []);

function addToSearchHistory(query) {
    if (!query.trim()) return;
    // 移除重复项
    searchHistory = searchHistory.filter(h => h !== query);
    // 添加到开头
    searchHistory.unshift(query);
    // 限制数量
    if (searchHistory.length > MAX_SEARCH_HISTORY) {
        searchHistory = searchHistory.slice(0, MAX_SEARCH_HISTORY);
    }
    LS.set('searchHistory', searchHistory);
}

function showSearchHistory() {
    const input = document.getElementById('searchInput');
    const container = document.getElementById('searchHistoryDropdown');

    if (searchHistory.length === 0) {
        container.classList.remove('visible');
        input.removeAttribute('aria-activedescendant');
        return;
    }

    // 转义 HTML 特殊字符
    const escapeHtml = (str) => str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    container.innerHTML = searchHistory.map((h, i) => {
        const safeH = escapeHtml(h);
        return `
        <div class="search-history-item" id="history-item-${i}" role="option"
             onclick="selectSearchHistory('${h.replace(/'/g, "\\'")}')"
             tabindex="-1">
            <span class="search-history-icon" aria-hidden="true">🕐</span>
            <span class="search-history-text">${safeH}</span>
            <button class="search-history-delete" onclick="deleteSearchHistory(${i}); event.stopPropagation();"
                    aria-label="删除搜索记录: ${safeH}">×</button>
        </div>
    `}).join('');

    container.classList.add('visible');
}

function hideSearchHistory() {
    setTimeout(() => {
        document.getElementById('searchHistoryDropdown').classList.remove('visible');
    }, 200);
}

function selectSearchHistory(query) {
    document.getElementById('searchInput').value = query;
    document.getElementById('searchHistoryDropdown').classList.remove('visible');
    document.getElementById('searchInput').focus();
}

function deleteSearchHistory(index) {
    searchHistory.splice(index, 1);
    LS.set('searchHistory', searchHistory);
    showSearchHistory();
}

function clearSearchHistory() {
    searchHistory = [];
    LS.set('searchHistory', searchHistory);
    document.getElementById('searchHistoryDropdown').classList.remove('visible');
    showToast('搜索历史已清除');
}

// 搜索表单提交
document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    const map = {
        google: 'https://www.google.com/search?q=',
        bing: 'https://www.bing.com/search?q=',
        baidu: 'https://www.baidu.com/s?wd=',
        github: 'https://github.com/search?q=',
        stackoverflow: 'https://stackoverflow.com/search?q='
    };
    if(q) {
        addToSearchHistory(q);
        location.href = map[document.getElementById('searchEngine').value] + encodeURIComponent(q);
    }
});

// 搜索框事件监听
document.getElementById('searchInput').addEventListener('focus', showSearchHistory);
document.getElementById('searchInput').addEventListener('blur', hideSearchHistory);
document.getElementById('searchInput').addEventListener('input', (e) => {
    if (e.target.value.trim() === '') {
        showSearchHistory();
    } else {
        document.getElementById('searchHistoryDropdown').classList.remove('visible');
    }
});

// ===== 页面加载时初始化 =====
init();

// ===== 音乐播放器初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
    await initMusicPlayer();

    // 初始化律动模式设置
    initRhythmSettings();
});

// ===== 律动模式控制 =====
let isRhythmMode = false;

function initRhythmSettings() {
    // 从 localStorage 恢复设置
    const savedTheme = localStorage.getItem('rhythmColorTheme') || 'purple';
    const savedReactivity = localStorage.getItem('rhythmReactivity') || '0.8';
    const savedEffectMode = localStorage.getItem('rhythmEffectMode') || 'wave';

    const themeSelect = document.getElementById('rhythmColorTheme');
    const reactivityInput = document.getElementById('rhythmReactivity');
    const reactivityValue = document.getElementById('val-reactivity');
    const effectModeSelect = document.getElementById('rhythmEffectMode');

    if (themeSelect) themeSelect.value = savedTheme;
    if (reactivityInput) reactivityInput.value = savedReactivity;
    if (reactivityValue) reactivityValue.textContent = savedReactivity;
    if (effectModeSelect) effectModeSelect.value = savedEffectMode;
}

function toggleRhythmMode() {
    isRhythmMode = !isRhythmMode;
    const toggleBtn = document.getElementById('rhythmModeToggle');
    const rhythmToggleBtn = document.getElementById('rhythmToggle');

    if (isRhythmMode) {
        // 开启律动模式
        if (toggleBtn) toggleBtn.classList.add('active');
        if (rhythmToggleBtn) {
            rhythmToggleBtn.setAttribute('aria-pressed', 'true');
            rhythmToggleBtn.classList.add('active');
        }
        startParticleRhythm();
        showToast('律动模式已开启');
    } else {
        // 关闭律动模式
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (rhythmToggleBtn) {
            rhythmToggleBtn.setAttribute('aria-pressed', 'false');
            rhythmToggleBtn.classList.remove('active');
        }
        stopParticleRhythm();
        showToast('律动模式已关闭');
    }
}

function updateRhythmTheme(theme) {
    localStorage.setItem('rhythmColorTheme', theme);
    if (particleRhythm) {
        particleRhythm.updateConfig({ colorTheme: theme });
    }
}

function updateRhythmReactivity(value) {
    const reactivityValue = document.getElementById('val-reactivity');
    if (reactivityValue) reactivityValue.textContent = value;

    localStorage.setItem('rhythmReactivity', value);
    if (particleRhythm) {
        particleRhythm.updateConfig({ reactivity: parseFloat(value) });
    }
}

function updateRhythmEffectMode(mode) {
    localStorage.setItem('rhythmEffectMode', mode);
    if (particleRhythm) {
        particleRhythm.updateConfig({ effectMode: mode });
    }

    // 显示特效名称提示
    const effectNames = {
        wave: '波浪律动',
        starfield: '星空穿梭',
        fireworks: '烟花绽放',
        vortex: '粒子漩涡',
        aurora: '极光效果',
        dna: 'DNA螺旋',
        neural: '神经网络',
        galaxy: '星系旋转',
        waveform: '音频波形'
    };
    showToast(`特效模式: ${effectNames[mode] || mode}`);
}

// 播放器展开/收起
function togglePlayerExpand() {
    const player = document.getElementById('musicPlayer');
    player.classList.toggle('expanded');
}

// 键盘快捷键扩展（音乐控制）
document.addEventListener('keydown', (e) => {
    // 如果在输入框中，不处理
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 空格键：播放/暂停
    if (e.code === 'Space' && musicPlayer && musicPlayer.playlist.length > 0) {
        e.preventDefault();
        toggleMusicPlayer();
    }
});
