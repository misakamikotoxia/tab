// ===== 音乐播放器模块 =====

// IndexedDB 音乐存储
const MusicDB = {
    db: null,
    dbName: 'MusicPlayerDB',
    storeName: 'music',

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('name', 'name', { unique: false });
                }
            };
        });
    },

    async add(musicData) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.add(musicData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clear() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// 音乐播放器类
class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;

        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.volume = parseFloat(localStorage.getItem('musicVolume') || '0.7');

        this.audio.volume = this.volume;

        // 自动隐藏配置
        this.autoHideEnabled = localStorage.getItem('playerAutoHide') !== 'false';
        this.autoHideTimeout = parseInt(localStorage.getItem('playerAutoHideTimeout') || '5000');
        this.autoHideTimer = null;

        // 事件回调
        this.onPlay = null;
        this.onPause = null;
        this.onEnded = null;
        this.onTimeUpdate = null;
        this.onTrackChange = null;
        this.onPlaylistChange = null;

        this.bindEvents();
    }

    bindEvents() {
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            if (this.onPlay) this.onPlay();
            this.resetAutoHideTimer();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            if (this.onPause) this.onPause();
            this.resetAutoHideTimer();
        });

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            if (this.onEnded) this.onEnded();
            this.next();
        });

        this.audio.addEventListener('timeupdate', () => {
            if (this.onTimeUpdate) {
                this.onTimeUpdate({
                    currentTime: this.audio.currentTime,
                    duration: this.audio.duration
                });
            }
        });
    }

    // 重置自动隐藏计时器
    resetAutoHideTimer() {
        this.clearAutoHideTimer();

        if (this.autoHideEnabled && this.autoHideTimeout > 0) {
            this.autoHideTimer = setTimeout(() => {
                this.hidePlayer();
            }, this.autoHideTimeout);
        }
    }

    // 清除自动隐藏计时器
    clearAutoHideTimer() {
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    // 隐藏播放器
    hidePlayer() {
        const player = document.getElementById('musicPlayer');
        if (player && !player.classList.contains('expanded')) {
            player.classList.add('auto-hidden');
        }
    }

    // 显示播放器
    showPlayer() {
        const player = document.getElementById('musicPlayer');
        if (player) {
            player.classList.remove('auto-hidden');
        }
        this.resetAutoHideTimer();
    }

    // 设置自动隐藏
    setAutoHide(enabled) {
        this.autoHideEnabled = enabled;
        localStorage.setItem('playerAutoHide', enabled.toString());

        if (enabled) {
            this.resetAutoHideTimer();
        } else {
            this.clearAutoHideTimer();
            this.showPlayer();
        }
    }

    // 设置自动隐藏时间
    setAutoHideTimeout(timeout) {
        this.autoHideTimeout = timeout;
        localStorage.setItem('playerAutoHideTimeout', timeout.toString());

        if (this.autoHideEnabled) {
            this.resetAutoHideTimer();
        }
    }

    // 初始化音频分析器（用于粒子律动）
    initAnalyser() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;

        this.source = this.audioContext.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    // 获取频谱数据
    getFrequencyData() {
        if (!this.analyser) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    // 加载播放列表
    async loadPlaylist() {
        this.playlist = await MusicDB.getAll();
        if (this.onPlaylistChange) this.onPlaylistChange(this.playlist);
        return this.playlist;
    }

    // 添加音乐
    async addMusic(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                const musicData = {
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    fileName: file.name,
                    type: file.type,
                    size: file.size,
                    data: e.target.result,
                    addedAt: Date.now()
                };

                try {
                    const id = await MusicDB.add(musicData);
                    musicData.id = id;
                    this.playlist.push(musicData);
                    if (this.onPlaylistChange) this.onPlaylistChange(this.playlist);
                    resolve(musicData);
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // 删除音乐
    async removeMusic(id) {
        await MusicDB.delete(id);
        const index = this.playlist.findIndex(m => m.id === id);
        if (index !== -1) {
            this.playlist.splice(index, 1);

            // 如果删除的是当前播放的歌曲
            if (index === this.currentIndex) {
                this.stop();
                this.currentIndex = -1;
            } else if (index < this.currentIndex) {
                this.currentIndex--;
            }

            if (this.onPlaylistChange) this.onPlaylistChange(this.playlist);
        }
    }

    // 播放指定索引的歌曲
    async playAt(index) {
        if (index < 0 || index >= this.playlist.length) return;

        const music = this.playlist[index];
        this.currentIndex = index;
        this.audio.src = music.data;

        // 初始化音频分析器
        this.initAnalyser();

        // 恢复音频上下文（浏览器策略）
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        await this.audio.play();

        if (this.onTrackChange) this.onTrackChange(music, index);
    }

    // 播放/暂停切换
    async toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            await this.play();
        }
    }

    // 播放
    async play() {
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            await this.playAt(0);
        } else if (this.audio.src) {
            // 恢复音频上下文
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            await this.audio.play();
        }
    }

    // 暂停
    pause() {
        this.audio.pause();
    }

    // 停止
    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
    }

    // 下一首
    async next() {
        if (this.playlist.length === 0) return;
        const nextIndex = (this.currentIndex + 1) % this.playlist.length;
        await this.playAt(nextIndex);
    }

    // 上一首
    async prev() {
        if (this.playlist.length === 0) return;
        const prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        await this.playAt(prevIndex);
    }

    // 跳转到指定时间
    seek(time) {
        if (this.audio.duration) {
            this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
        }
    }

    // 设置音量
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        this.audio.volume = this.volume;
        localStorage.setItem('musicVolume', this.volume.toString());
    }

    // 获取当前歌曲
    getCurrentTrack() {
        if (this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
            return this.playlist[this.currentIndex];
        }
        return null;
    }

    // 格式化时间
    static formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// 全局播放器实例
let musicPlayer = null;

// 初始化播放器
async function initMusicPlayer() {
    await MusicDB.init();
    musicPlayer = new MusicPlayer();
    await musicPlayer.loadPlaylist();

    // 绑定 UI 更新回调
    musicPlayer.onPlay = updatePlayerUI;
    musicPlayer.onPause = updatePlayerUI;
    musicPlayer.onTimeUpdate = updateProgressUI;
    musicPlayer.onTrackChange = updateTrackUI;
    musicPlayer.onPlaylistChange = updatePlaylistUI;

    // 初始化 UI
    updatePlayerUI();
    updatePlaylistUI(musicPlayer.playlist);

    // 绑定播放器鼠标事件
    const player = document.getElementById('musicPlayer');
    if (player) {
        player.addEventListener('mouseenter', () => {
            musicPlayer.showPlayer();
        });

        player.addEventListener('mouseleave', () => {
            if (musicPlayer.autoHideEnabled) {
                musicPlayer.resetAutoHideTimer();
            }
        });
    }

    // 初始化自动隐藏设置 UI
    updateAutoHideUI();

    // 初始化歌词管理器
    if (typeof initLyricsManager === 'function') {
        initLyricsManager();
    }

    return musicPlayer;
}

// ===== UI 更新函数 =====

function updatePlayerUI() {
    const playBtn = document.getElementById('playerPlayBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');

    if (playBtn) {
        playBtn.textContent = musicPlayer.isPlaying ? '⏸' : '▶';
        playBtn.setAttribute('aria-label', musicPlayer.isPlaying ? '暂停' : '播放');
    }

    if (miniPlayBtn) {
        miniPlayBtn.textContent = musicPlayer.isPlaying ? '⏸' : '▶';
    }

    // 显示/隐藏播放器
    const player = document.getElementById('musicPlayer');
    if (player && musicPlayer.playlist.length > 0) {
        player.classList.add('visible');
        musicPlayer.resetAutoHideTimer();
    }
}

// 更新自动隐藏设置 UI
function updateAutoHideUI() {
    const autoHideToggle = document.getElementById('playerAutoHideToggle');
    const autoHideTimeSelect = document.getElementById('playerAutoHideTime');

    if (autoHideToggle) {
        autoHideToggle.classList.toggle('active', musicPlayer.autoHideEnabled);
    }

    if (autoHideTimeSelect) {
        autoHideTimeSelect.value = musicPlayer.autoHideTimeout.toString();
        autoHideTimeSelect.disabled = !musicPlayer.autoHideEnabled;
    }
}

function updateProgressUI({ currentTime, duration }) {
    const progress = document.getElementById('playerProgress');
    const currentTimeEl = document.getElementById('playerCurrentTime');
    const durationEl = document.getElementById('playerDuration');

    if (progress && duration) {
        progress.value = (currentTime / duration) * 100;
    }

    if (currentTimeEl) {
        currentTimeEl.textContent = MusicPlayer.formatTime(currentTime);
    }

    if (durationEl) {
        durationEl.textContent = MusicPlayer.formatTime(duration);
    }

    // 更新歌词显示
    if (typeof lyricsManager !== 'undefined' && lyricsManager) {
        lyricsManager.update(currentTime);
    }
}

function updateTrackUI(track, index) {
    const trackName = document.getElementById('playerTrackName');
    const miniTrackName = document.getElementById('miniTrackName');

    if (trackName) {
        trackName.textContent = track.name;
    }

    if (miniTrackName) {
        miniTrackName.textContent = track.name;
    }

    // 更新播放列表中的激活状态
    document.querySelectorAll('.music-item').forEach((item, i) => {
        item.classList.toggle('playing', i === index);
    });

    // 更新设置面板中的列表
    document.querySelectorAll('.settings-music-item').forEach((item) => {
        const itemId = parseInt(item.dataset.id);
        item.classList.toggle('playing', itemId === track.id);
    });
}

function updatePlaylistUI(playlist) {
    // 更新设置面板中的音乐列表
    const listContainer = document.getElementById('musicList');
    if (!listContainer) return;

    if (playlist.length === 0) {
        listContainer.innerHTML = '<div class="music-list-empty">暂无音乐，点击上方添加</div>';
        return;
    }

    listContainer.innerHTML = playlist.map((music, index) => `
        <div class="settings-music-item ${musicPlayer.currentIndex === index ? 'playing' : ''}" data-id="${music.id}">
            <div class="music-item-icon">${musicPlayer.currentIndex === index && musicPlayer.isPlaying ? '🎵' : '🎶'}</div>
            <div class="music-item-info">
                <div class="music-item-name">${music.name}</div>
                <div class="music-item-size">${formatFileSize(music.size)}</div>
            </div>
            <div class="music-item-actions">
                <button class="music-item-btn play" onclick="playMusicAt(${index})" title="播放">▶</button>
                <button class="music-item-btn delete" onclick="removeMusic(${music.id})" title="删除">×</button>
            </div>
        </div>
    `).join('');
}

// ===== 辅助函数 =====

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== 全局控制函数 =====

async function addMusicFiles(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;

    for (const file of files) {
        if (file.type.startsWith('audio/')) {
            try {
                await musicPlayer.addMusic(file);
                showToast(`已添加: ${file.name}`);
            } catch (err) {
                console.error('添加音乐失败:', err);
                showToast('添加失败: ' + file.name);
            }
        }
    }

    // 清空 input
    input.value = '';

    // 显示播放器
    const player = document.getElementById('musicPlayer');
    if (player) player.classList.add('visible');
}

async function playMusicAt(index) {
    await musicPlayer.playAt(index);
}

async function removeMusic(id) {
    if (confirm('确定删除这首音乐？')) {
        await musicPlayer.removeMusic(id);
        showToast('已删除');
    }
}

async function clearAllMusic() {
    if (confirm('确定清除所有音乐？')) {
        musicPlayer.stop();
        await MusicDB.clear();
        musicPlayer.playlist = [];
        musicPlayer.currentIndex = -1;
        updatePlaylistUI([]);

        const player = document.getElementById('musicPlayer');
        if (player) player.classList.remove('visible');

        showToast('已清除所有音乐');
    }
}

function toggleMusicPlayer() {
    musicPlayer.toggle();
}

function nextTrack() {
    musicPlayer.next();
}

function prevTrack() {
    musicPlayer.prev();
}

function seekMusic(value) {
    const duration = musicPlayer.audio.duration;
    if (duration) {
        musicPlayer.seek((value / 100) * duration);
    }
}

function setMusicVolume(value) {
    musicPlayer.setVolume(value / 100);
    const volumeValue = document.getElementById('volumeValue');
    if (volumeValue) {
        volumeValue.textContent = Math.round(value) + '%';
    }
}

// 切换自动隐藏
function togglePlayerAutoHide() {
    musicPlayer.setAutoHide(!musicPlayer.autoHideEnabled);
    updateAutoHideUI();
}

// 设置自动隐藏时间
function setPlayerAutoHideTime(value) {
    const timeout = parseInt(value);
    musicPlayer.setAutoHideTimeout(timeout);
}
