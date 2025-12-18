// ===== 歌词模块 =====
// 支持 LRC 格式歌词解析、显示和交互

class LyricsManager {
    constructor() {
        this.lyrics = [];           // 解析后的歌词数组 [{time, text}]
        this.currentIndex = -1;     // 当前歌词索引
        this.isVisible = false;     // 歌词是否显示
        this.container = null;      // 歌词容器元素
        this.scrollTimeout = null;  // 滚动防抖
        this.userScrolling = false; // 用户是否正在滚动

        // 配置
        this.config = {
            fontSize: parseFloat(localStorage.getItem('lyricsFontSize') || '1.5'),
            opacity: parseFloat(localStorage.getItem('lyricsOpacity') || '0.9'),
            offset: parseFloat(localStorage.getItem('lyricsOffset') || '0')  // 时间偏移（秒）
        };

        this.init();
    }

    init() {
        this.createContainer();
        this.bindEvents();
    }

    // 创建歌词容器
    createContainer() {
        if (document.getElementById('lyricsContainer')) {
            this.container = document.getElementById('lyricsContainer');
            return;
        }

        this.container = document.createElement('div');
        this.container.id = 'lyricsContainer';
        this.container.className = 'lyrics-container';
        this.container.innerHTML = `
            <div class="lyrics-wrapper" id="lyricsWrapper">
                <div class="lyrics-content" id="lyricsContent"></div>
            </div>
        `;

        // 创建独立的控制按钮容器
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.id = 'lyricsControls';
        this.controlsContainer.className = 'lyrics-controls';
        this.controlsContainer.innerHTML = `
            <button class="lyrics-control-btn" onclick="lyricsManager.adjustOffset(-0.5)" title="歌词提前0.5秒">-0.5s</button>
            <span class="lyrics-offset-display" id="lyricsOffsetDisplay">+0.0s</span>
            <button class="lyrics-control-btn" onclick="lyricsManager.adjustOffset(0.5)" title="歌词延后0.5秒">+0.5s</button>
        `;

        document.body.appendChild(this.container);
        document.body.appendChild(this.controlsContainer);
    }

    // 绑定事件
    bindEvents() {
        const wrapper = document.getElementById('lyricsWrapper');
        if (wrapper) {
            // 用户滚动时暂停自动滚动
            wrapper.addEventListener('scroll', () => {
                this.userScrolling = true;
                clearTimeout(this.scrollTimeout);
                this.scrollTimeout = setTimeout(() => {
                    this.userScrolling = false;
                }, 3000);
            });

            // 触摸事件
            wrapper.addEventListener('touchstart', () => {
                this.userScrolling = true;
            });

            wrapper.addEventListener('touchend', () => {
                clearTimeout(this.scrollTimeout);
                this.scrollTimeout = setTimeout(() => {
                    this.userScrolling = false;
                }, 3000);
            });
        }
    }

    // 解析 LRC 格式歌词
    parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lyrics = [];
        const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

        for (const line of lines) {
            const times = [];
            let match;
            let text = line;

            // 提取所有时间标签
            while ((match = timeRegex.exec(line)) !== null) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
                const time = minutes * 60 + seconds + ms / 1000;
                times.push(time);
            }

            // 移除时间标签，获取歌词文本
            text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();

            // 跳过元信息标签
            if (text.startsWith('[') || text === '') continue;

            // 为每个时间标签创建歌词条目
            for (const time of times) {
                lyrics.push({ time, text });
            }
        }

        // 按时间排序
        lyrics.sort((a, b) => a.time - b.time);

        return lyrics;
    }

    // 从文本加载歌词
    loadFromText(lrcText) {
        this.lyrics = this.parseLRC(lrcText);
        this.currentIndex = -1;
        this.render();
        return this.lyrics.length > 0;
    }

    // 从文件加载歌词
    async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const success = this.loadFromText(e.target.result);
                resolve(success);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    // 渲染歌词列表
    render() {
        const content = document.getElementById('lyricsContent');
        if (!content) return;

        if (this.lyrics.length === 0) {
            content.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
            return;
        }

        content.innerHTML = this.lyrics.map((lyric, index) => `
            <div class="lyrics-line" data-index="${index}" onclick="lyricsManager.seekTo(${index})">
                ${lyric.text}
            </div>
        `).join('');

        this.updateStyle();
    }

    // 更新样式
    updateStyle() {
        const content = document.getElementById('lyricsContent');
        if (content) {
            content.style.fontSize = this.config.fontSize + 'rem';
            content.style.opacity = this.config.opacity;
        }
    }

    // 根据当前播放时间更新歌词
    update(currentTime) {
        if (!this.isVisible || this.lyrics.length === 0) return;

        const adjustedTime = currentTime + this.config.offset;

        // 查找当前歌词索引
        let newIndex = -1;
        for (let i = this.lyrics.length - 1; i >= 0; i--) {
            if (adjustedTime >= this.lyrics[i].time) {
                newIndex = i;
                break;
            }
        }

        if (newIndex !== this.currentIndex) {
            this.currentIndex = newIndex;
            this.highlightCurrent();

            if (!this.userScrolling) {
                this.scrollToCurrent();
            }
        }
    }

    // 高亮当前歌词
    highlightCurrent() {
        const lines = document.querySelectorAll('.lyrics-line');
        lines.forEach((line, index) => {
            line.classList.toggle('active', index === this.currentIndex);
            line.classList.toggle('past', index < this.currentIndex);
        });
    }

    // 滚动到当前歌词
    scrollToCurrent() {
        if (this.currentIndex < 0) return;

        const wrapper = document.getElementById('lyricsWrapper');
        const currentLine = document.querySelector('.lyrics-line.active');

        if (wrapper && currentLine) {
            const wrapperHeight = wrapper.clientHeight;
            const lineTop = currentLine.offsetTop;
            const lineHeight = currentLine.clientHeight;

            // 将当前行滚动到容器中央
            const scrollTop = lineTop - (wrapperHeight / 2) + (lineHeight / 2);

            wrapper.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }

    // 点击歌词跳转播放位置
    seekTo(index) {
        if (index < 0 || index >= this.lyrics.length) return;

        const time = this.lyrics[index].time - this.config.offset;
        if (musicPlayer && musicPlayer.audio) {
            musicPlayer.seek(Math.max(0, time));
        }

        this.currentIndex = index;
        this.highlightCurrent();
    }

    // 调整时间偏移
    adjustOffset(delta) {
        this.config.offset += delta;
        localStorage.setItem('lyricsOffset', this.config.offset.toString());

        const display = document.getElementById('lyricsOffsetDisplay');
        if (display) {
            display.textContent = (this.config.offset >= 0 ? '+' : '') + this.config.offset.toFixed(1) + 's';
        }

        // 立即更新显示
        if (musicPlayer && musicPlayer.audio) {
            this.update(musicPlayer.audio.currentTime);
        }
    }

    // 设置字体大小
    setFontSize(size) {
        this.config.fontSize = Math.max(0.8, Math.min(3, size));
        localStorage.setItem('lyricsFontSize', this.config.fontSize.toString());
        this.updateStyle();
    }

    // 设置透明度
    setOpacity(opacity) {
        this.config.opacity = Math.max(0.1, Math.min(1, opacity));
        localStorage.setItem('lyricsOpacity', this.config.opacity.toString());
        this.updateStyle();
    }

    // 显示歌词
    show() {
        this.isVisible = true;
        this.container.classList.add('visible');
        if (this.controlsContainer) {
            this.controlsContainer.classList.add('visible');
        }

        // 更新偏移显示
        const display = document.getElementById('lyricsOffsetDisplay');
        if (display) {
            display.textContent = (this.config.offset >= 0 ? '+' : '') + this.config.offset.toFixed(1) + 's';
        }

        // 立即更新当前歌词
        if (musicPlayer && musicPlayer.audio) {
            this.update(musicPlayer.audio.currentTime);
        }
    }

    // 隐藏歌词
    hide() {
        this.isVisible = false;
        this.container.classList.remove('visible');
        if (this.controlsContainer) {
            this.controlsContainer.classList.remove('visible');
        }
    }

    // 切换显示
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // 清空歌词
    clear() {
        this.lyrics = [];
        this.currentIndex = -1;
        this.config.offset = 0;
        localStorage.setItem('lyricsOffset', '0');
        this.render();
    }

    // 检查是否有歌词
    hasLyrics() {
        return this.lyrics.length > 0;
    }
}

// 全局实例
let lyricsManager = null;

// 初始化歌词管理器
function initLyricsManager() {
    if (!lyricsManager) {
        lyricsManager = new LyricsManager();
    }
    return lyricsManager;
}

// 切换歌词显示
function toggleLyrics() {
    if (!lyricsManager) {
        initLyricsManager();
    }
    lyricsManager.toggle();

    const btn = document.getElementById('lyricsToggleBtn');
    if (btn) {
        btn.classList.toggle('active', lyricsManager.isVisible);
    }
}

// 加载歌词文件
async function loadLyricsFile(input) {
    const file = input.files[0];
    if (!file) return;

    if (!lyricsManager) {
        initLyricsManager();
    }

    try {
        const success = await lyricsManager.loadFromFile(file);
        if (success) {
            showToast(`已加载歌词: ${file.name}`);
            lyricsManager.show();
        } else {
            showToast('歌词文件为空或格式错误', 'error');
        }
    } catch (err) {
        console.error('加载歌词失败:', err);
        showToast('加载歌词失败', 'error');
    }

    input.value = '';
}

// 更新歌词字体大小
function updateLyricsFontSize(value) {
    if (lyricsManager) {
        lyricsManager.setFontSize(parseFloat(value));
    }
    const display = document.getElementById('val-lyrics-font');
    if (display) {
        display.textContent = value + 'rem';
    }
}

// 更新歌词透明度
function updateLyricsOpacity(value) {
    if (lyricsManager) {
        lyricsManager.setOpacity(parseFloat(value));
    }
    const display = document.getElementById('val-lyrics-opacity');
    if (display) {
        display.textContent = Math.round(value * 100) + '%';
    }
}
