// ===== 粒子律动系统 =====
// 与音乐播放器配合，实现粒子随音乐节奏律动

class ParticleRhythm {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.isActive = false;
        this.animationId = null;
        this.time = 0;

        // 烟花专用数据
        this.fireworksData = { rockets: [], explosions: [] };

        // 配置
        this.config = {
            particleCount: 120,
            baseSize: 2,
            maxSize: 8,
            speed: 1,
            reactivity: 0.8,
            colorTheme: 'purple',
            blendMode: 'screen',
            effectMode: 'wave'
        };

        // 颜色主题
        this.themes = {
            purple: { h: 250, s: 80, l: 60 },
            blue: { h: 200, s: 80, l: 55 },
            pink: { h: 330, s: 80, l: 60 },
            cyan: { h: 180, s: 80, l: 50 },
            rainbow: null
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;

        if (this.isActive) {
            this.initParticles();
        }
    }

    initParticles() {
        this.particles = [];
        this.fireworksData = { rockets: [], explosions: [] };

        const mode = this.config.effectMode;
        const count = this.config.particleCount;

        switch (mode) {
            case 'neural':
                for (let i = 0; i < Math.min(count, 80); i++) {
                    this.particles.push({
                        x: Math.random() * this.canvas.width,
                        y: Math.random() * this.canvas.height,
                        vx: (Math.random() - 0.5) * 0.8,
                        vy: (Math.random() - 0.5) * 0.8,
                        size: 3 + Math.random() * 4,
                        hueOffset: Math.random() * 120,  // 更大的色彩范围
                        hueSpeed: (Math.random() - 0.5) * 2,  // 色彩变化速度
                        opacity: 0.6 + Math.random() * 0.4,
                        energy: Math.random(),
                        wanderAngle: Math.random() * Math.PI * 2  // 随机游走角度
                    });
                }
                break;

            case 'fireworks':
                // 烟花模式不需要预初始化粒子
                break;

            default: // wave
                for (let i = 0; i < count; i++) {
                    this.particles.push({
                        x: Math.random() * this.canvas.width,
                        y: Math.random() * this.canvas.height,
                        baseX: Math.random() * this.canvas.width,
                        baseY: Math.random() * this.canvas.height,
                        vx: 0,
                        vy: 0,
                        size: 2 + Math.random() * 2,
                        hueOffset: Math.random() * 60 - 30,
                        phase: Math.random() * Math.PI * 2,
                        amplitude: 20 + Math.random() * 40,
                        speed: 0.5 + Math.random() * 0.5,
                        opacity: 0.4 + Math.random() * 0.4
                    });
                }
        }
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.initParticles();
        this.canvas.style.opacity = '1';
        this.animate();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.canvas.style.opacity = '0';
    }

    getAudioData() {
        if (typeof musicPlayer !== 'undefined' && musicPlayer && musicPlayer.isPlaying) {
            const data = musicPlayer.getFrequencyData();
            if (data) {
                const len = data.length;
                let low = 0, mid = 0, high = 0;

                for (let i = 0; i < len * 0.2; i++) low += data[i];
                for (let i = Math.floor(len * 0.2); i < len * 0.6; i++) mid += data[i];
                for (let i = Math.floor(len * 0.6); i < len; i++) high += data[i];

                return {
                    low: low / (len * 0.2) / 255,
                    mid: mid / (len * 0.4) / 255,
                    high: high / (len * 0.4) / 255,
                    raw: data
                };
            }
        }

        return {
            low: 0.3 + Math.sin(this.time * 2) * 0.2,
            mid: 0.3 + Math.sin(this.time * 3) * 0.2,
            high: 0.3 + Math.sin(this.time * 4) * 0.2,
            raw: null
        };
    }

    getColor(hueOffset = 0, alpha = 1) {
        if (this.config.colorTheme === 'rainbow') {
            const hue = (this.time * 50 + hueOffset) % 360;
            return `hsla(${hue}, 80%, 60%, ${alpha})`;
        }

        const theme = this.themes[this.config.colorTheme];
        const hue = (theme.h + hueOffset) % 360;
        return `hsla(${hue}, ${theme.s}%, ${theme.l}%, ${alpha})`;
    }

    animate() {
        if (!this.isActive) return;

        this.time += 0.016 * this.config.speed;
        const audio = this.getAudioData();

        // 完全清除画布（透明背景）
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.globalCompositeOperation = this.config.blendMode;

        const mode = this.config.effectMode;
        switch (mode) {
            case 'neural': this.renderNeural(audio); break;
            case 'fireworks': this.renderFireworks(audio); break;
            default: this.renderWave(audio);
        }

        this.ctx.globalCompositeOperation = 'source-over';
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // 波浪律动
    renderWave(audio) {
        const r = this.config.reactivity;

        this.particles.forEach((p, i) => {
            const freq = audio.raw ? audio.raw[i % 128] / 255 : audio.mid;

            const waveX = Math.sin(this.time * p.speed + p.phase) * p.amplitude * (1 + audio.low * r);
            const waveY = Math.cos(this.time * p.speed * 0.7 + p.phase) * p.amplitude * 0.5;

            p.x = p.baseX + waveX;
            p.y = p.baseY + waveY;

            if (p.x < 0) p.x += this.canvas.width;
            if (p.x > this.canvas.width) p.x -= this.canvas.width;
            if (p.y < 0) p.y += this.canvas.height;
            if (p.y > this.canvas.height) p.y -= this.canvas.height;

            const size = p.size * (1 + freq * r * 2);
            const alpha = p.opacity * (0.5 + freq * 0.5);

            this.drawGlowParticle(p.x, p.y, size, p.hueOffset, alpha, freq);
        });
    }

    // 神经网络
    renderNeural(audio) {
        const r = this.config.reactivity;

        // 更新粒子
        this.particles.forEach(p => {
            // 随机游走：缓慢改变方向
            p.wanderAngle += (Math.random() - 0.5) * 0.3;

            // 基于游走角度的加速度
            const wanderForce = 0.03 + audio.mid * r * 0.02;
            p.vx += Math.cos(p.wanderAngle) * wanderForce;
            p.vy += Math.sin(p.wanderAngle) * wanderForce;

            // 音乐响应：节拍时轻微加速
            if (audio.low > 0.5) {
                p.vx *= 1.02;
                p.vy *= 1.02;
            }

            // 速度限制和阻尼
            const maxSpeed = 1.2 + audio.mid * r * 0.8;
            const speed = Math.hypot(p.vx, p.vy);
            if (speed > maxSpeed) {
                p.vx = (p.vx / speed) * maxSpeed;
                p.vy = (p.vy / speed) * maxSpeed;
            }
            p.vx *= 0.985;
            p.vy *= 0.985;

            // 更新位置
            p.x += p.vx;
            p.y += p.vy;

            // 边界环绕
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;

            // 色彩渐变
            p.hueOffset += p.hueSpeed * (0.5 + audio.high * r);

            // 能量系统
            p.energy *= 0.97;
            if (audio.low > 0.5 && Math.random() < 0.08) {
                p.energy = 1;
            }
        });

        // 绘制连线
        const maxDist = 180 + audio.low * r * 40;
        this.ctx.lineCap = 'round';

        for (let i = 0; i < this.particles.length; i++) {
            const p1 = this.particles[i];
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

                if (dist < maxDist) {
                    const strength = (1 - dist / maxDist);
                    const energy = Math.max(p1.energy, p2.energy);
                    const alpha = strength * (0.2 + energy * 0.4);

                    if (alpha > 0.06) {
                        // 连线颜色混合两个节点的颜色
                        const mixedHue = (p1.hueOffset + p2.hueOffset) / 2;
                        this.ctx.strokeStyle = this.getColor(mixedHue, alpha);
                        this.ctx.lineWidth = 0.8 + energy * 1.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();

                        // 能量传递
                        if (p1.energy > 0.6 && p2.energy < 0.3 && Math.random() < 0.03) {
                            p2.energy = Math.min(1, p2.energy + 0.2);
                            p1.energy *= 0.85;
                            // 传递时色彩也会影响
                            p2.hueOffset = (p2.hueOffset + p1.hueOffset) / 2;
                        }
                    }
                }
            }
        }

        // 绘制节点
        this.particles.forEach(p => {
            const size = p.size * (1 + p.energy * 0.6) * (1 + audio.high * r * 0.3);
            const alpha = p.opacity * (0.5 + p.energy * 0.5);

            // 发光效果
            this.ctx.shadowBlur = 8 + p.energy * 15;
            this.ctx.shadowColor = this.getColor(p.hueOffset, 0.5);

            this.drawGlowParticle(p.x, p.y, size, p.hueOffset, alpha, p.energy);

            // 高能量时的光环
            if (p.energy > 0.6) {
                this.ctx.strokeStyle = this.getColor(p.hueOffset + 30, p.energy * 0.25);
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, size + 4 + p.energy * 6, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        });

        this.ctx.shadowBlur = 0;
    }

    // 烟花绽放
    renderFireworks(audio) {
        const r = this.config.reactivity;

        // 检测音乐激昂程度（低频+中频的综合）
        const intensity = (audio.low + audio.mid) / 2;
        const isIntense = intensity > 0.6;

        // 发射普通火箭
        if (audio.low > 0.3 && Math.random() < 0.12) {
            this.fireworksData.rockets.push({
                x: Math.random() * this.canvas.width,
                y: this.canvas.height,
                vx: (Math.random() - 0.5) * 4,
                vy: -12 - Math.random() * 6,
                hue: Math.random() * 360,
                life: 1,
                isGiant: false
            });
        }

        // 音乐激昂时发射大型烟花
        if (isIntense && Math.random() < 0.15) {
            this.fireworksData.rockets.push({
                x: this.canvas.width * (0.2 + Math.random() * 0.6),
                y: this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: -15 - Math.random() * 5,
                hue: Math.random() * 360,
                life: 1,
                isGiant: true
            });
        }

        // 更新火箭
        this.fireworksData.rockets = this.fireworksData.rockets.filter(rocket => {
            rocket.x += rocket.vx;
            rocket.y += rocket.vy;
            rocket.vy += 0.18;
            rocket.life -= 0.008;

            // 火箭尾迹
            const trailSize = rocket.isGiant ? 6 : 4;
            this.drawGlowParticle(rocket.x, rocket.y, trailSize, rocket.hue, rocket.life, 0.9);

            // 火箭尾焰
            for (let i = 0; i < 3; i++) {
                const tx = rocket.x + (Math.random() - 0.5) * 4;
                const ty = rocket.y + Math.random() * 8;
                this.drawGlowParticle(tx, ty, 2, rocket.hue + 30, rocket.life * 0.5, 0.5);
            }

            if (rocket.vy > -2 || rocket.life < 0.4) {
                this.createExplosion(rocket.x, rocket.y, rocket.hue, rocket.isGiant, audio);
                return false;
            }
            return true;
        });

        // 更新爆炸粒子
        this.fireworksData.explosions = this.fireworksData.explosions.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.985;
            p.vy *= 0.985;
            p.life -= 0.015;

            const size = p.size * (0.5 + p.life * 0.5) * (1 + audio.high * r * 0.3);
            const alpha = p.life * 0.9;

            this.drawGlowParticle(p.x, p.y, size, p.hue, alpha, p.life);

            // 闪烁尾迹
            if (p.life > 0.3 && Math.random() < 0.3) {
                this.drawGlowParticle(
                    p.x - p.vx * 2,
                    p.y - p.vy * 2,
                    size * 0.5,
                    p.hue,
                    alpha * 0.4,
                    0.3
                );
            }

            return p.life > 0;
        });
    }

    // 创建烟花爆炸
    createExplosion(x, y, hue, isGiant, audio) {
        const baseCount = isGiant ? 80 : 50;
        const count = baseCount + Math.floor(audio.mid * 30);
        const baseSpeed = isGiant ? 6 : 4;
        const baseSize = isGiant ? 4 : 2.5;

        // 主爆炸
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = baseSpeed + Math.random() * (isGiant ? 8 : 5);
            const spread = isGiant ? 0.3 : 0.2;

            this.fireworksData.explosions.push({
                x: x,
                y: y,
                vx: Math.cos(angle + (Math.random() - 0.5) * spread) * speed,
                vy: Math.sin(angle + (Math.random() - 0.5) * spread) * speed,
                hue: hue + (Math.random() - 0.5) * 50,
                size: baseSize + Math.random() * (isGiant ? 3 : 2),
                life: 1
            });
        }

        // 大型烟花额外添加内圈
        if (isGiant) {
            const innerCount = 40;
            for (let i = 0; i < innerCount; i++) {
                const angle = (i / innerCount) * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                this.fireworksData.explosions.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    hue: hue + 180,
                    size: 3 + Math.random() * 2,
                    life: 1.2
                });
            }

            // 中心闪光
            for (let i = 0; i < 20; i++) {
                this.fireworksData.explosions.push({
                    x: x + (Math.random() - 0.5) * 20,
                    y: y + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    hue: 60,
                    size: 5 + Math.random() * 3,
                    life: 0.8
                });
            }
        }
    }

    // 绘制发光粒子
    drawGlowParticle(x, y, size, hueOffset, alpha, glow) {
        if (glow > 0.3) {
            this.ctx.shadowBlur = 8 + glow * 12;
            this.ctx.shadowColor = this.getColor(hueOffset, 0.5);
        } else {
            this.ctx.shadowBlur = 0;
        }

        this.ctx.fillStyle = this.getColor(hueOffset, alpha);
        this.ctx.beginPath();
        this.ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
        this.ctx.fill();
    }

    updateConfig(newConfig) {
        const needReinit = newConfig.effectMode && newConfig.effectMode !== this.config.effectMode;
        Object.assign(this.config, newConfig);

        if (needReinit && this.isActive) {
            this.initParticles();
        }
    }
}

// ===== 全局实例 =====
let particleRhythm = null;

function initParticleRhythm() {
    let canvas = document.getElementById('particleRhythmCanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'particleRhythmCanvas';
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.5s ease;
            mix-blend-mode: screen;
        `;

        const bgOverlay = document.querySelector('.background-overlay');
        if (bgOverlay) {
            bgOverlay.after(canvas);
        } else {
            document.body.insertBefore(canvas, document.body.firstChild);
        }
    }

    particleRhythm = new ParticleRhythm(canvas);

    const savedTheme = localStorage.getItem('rhythmColorTheme') || 'purple';
    const savedReactivity = localStorage.getItem('rhythmReactivity') || '0.8';
    const savedEffectMode = localStorage.getItem('rhythmEffectMode') || 'wave';

    particleRhythm.updateConfig({
        colorTheme: savedTheme,
        reactivity: parseFloat(savedReactivity),
        effectMode: savedEffectMode
    });
}

function startParticleRhythm() {
    if (!particleRhythm) {
        initParticleRhythm();
    }
    particleRhythm.start();

    const staticParticles = document.getElementById('particles');
    if (staticParticles) staticParticles.style.opacity = '0';
}

function stopParticleRhythm() {
    if (particleRhythm) {
        particleRhythm.stop();
    }

    const staticParticles = document.getElementById('particles');
    if (staticParticles) staticParticles.style.opacity = '1';
}

function updateParticleRhythmConfig(config) {
    if (particleRhythm) {
        particleRhythm.updateConfig(config);
    }
}
