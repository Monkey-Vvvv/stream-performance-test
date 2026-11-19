const byId = id => document.getElementById(id);
const count = byId('count');
const start = byId('start');
const stop = byId('stop');
const urls = [];
let rows = [];
let running = false;
let since = null;
let history = [];

for (let i = 1; i <= 16; i++) count.add(new Option(i, i));
function render() {
    rows = Array.from({ length: Number(count.value) }, (_, i) => {
        const card = document.createElement('article');
        card.innerHTML = '<strong></strong><input type="url" placeholder="输入此路拉流地址"><div class="video"></div><p>待播放</p>';
        card.firstChild.textContent = '第 ' + (i + 1) + ' 路';
        const input = card.querySelector('input');
        input.setAttribute('aria-label', '第 ' + (i + 1) + ' 路地址');
        input.value = urls[i] || '';
        input.oninput = () => { urls[i] = input.value; };
        return { card, input, video: card.querySelector('.video'), status: card.querySelector('p') };
    });
    byId('streams').replaceChildren(...rows.map(row => row.card));
    for (const row of rows) update(row, '待播放');
}
function update(row, state) {
    row.state = state;
    row.status.dataset.state = state;
    const video = row.video.querySelector('video');
    const idle = state === '待播放' || state === '已停止';
    let buffer = '未提供';
    for (let i = 0; video && i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
            buffer = (video.buffered.end(i) - video.currentTime).toFixed(2) + ' 秒';
            break;
        }
    }
    const path = row.player?.getDecodeType?.()?.trim() || '';
    const decode = /^wasm\b/i.test(path) ? 'WASM 软解' : path ? path + '（软硬解未确认）' : '未确认';
    row.status.textContent = state + ' · 编码 ' + (row.codec || '—') +
        ' · 分辨率 ' + (row.size || '—') +
        ' · 帧率 ' + (row.fps == null ? '—' : row.fps + ' fps') +
        '\n前向缓冲 ' + (idle ? '—' : buffer) + ' · 解码 ' + (idle ? '—' : decode);

    const playing = rows.filter(item => item.state === '播放中').length;
    byId('summary').textContent = '播放中 ' + playing + ' / ' + rows.length;
    if (running && playing > 0) since ??= Date.now();
    else { since = null; history = []; }
}
start.onclick = () => {
    if (rows.some(row => !row.input.value.trim() || !row.input.checkValidity())) {
        byId('summary').textContent = '请填写每一路的完整拉流地址';
        return;
    }
    running = true;
    start.disabled = count.disabled = true;
    stop.disabled = false;
    for (const row of rows) {
        row.input.disabled = true;
        row.size = row.codec = row.fps = null;
        update(row, '连接中');
        const reportError = () => { if (running) update(row, '播放异常'); };
        try {
            const player = new JessibucaPro({
                container: row.video, loadingIcon: false, videoBuffer: 0, videoBufferDelay: 5,
                controlAutoHide: true, hasAudio: false, useMSE: true, useSIMD: true,
                loadingTimeoutReplayTimes: -1, heartTimeoutReplayTimes: -1
            });
            row.player = player;
            player.on('videoInfo', ({ width, height, encType }) => {
                if (!running) return;
                row.codec = encType;
                if (width > 0 && height > 0) row.size = width + ' × ' + height;
                update(row, row.state);
            });
            player.on('stats', ({ fps }) => {
                if (!running) return;
                row.fps = Number.isFinite(fps) ? fps : null;
                update(row, row.state);
            });
            player.on('start', () => { if (running) update(row, '播放中'); });
            for (const event of ['error', 'timeout', 'playFailedAndPaused', 'webrtcError']) player.on(event, reportError);
            Promise.resolve(player.play(row.input.value.trim())).catch(reportError);
        } catch { reportError(); }
    }
};
stop.onclick = async () => {
    running = false;
    since = null;
    history = [];
    stop.disabled = true;
    await Promise.allSettled(rows.map(async row => {
        try { await row.player?.destroy(); }
        finally {
            row.player = row.size = row.codec = row.fps = null;
            row.input.disabled = false;
            update(row, '已停止');
        }
    }));
    start.disabled = count.disabled = false;
};
count.onchange = render;
render();

const percent = value => value == null ? '未采到' : value.toFixed(1) + '%';
function average(now, select) {
    if (since === null || now - since < 60000 || history.length < 2) return '';
    if (history[0].time > now - 60000) return '';
    let sum = 0;
    let duration = 0;
    for (let i = 0; i < history.length - 1; i++) {
        const sample = history[i];
        const next = history[i + 1];
        const value = select(sample);
        if (value == null || next.time - sample.time > 5000) return '';
        const span = next.time - Math.max(sample.time, now - 60000);
        sum += span * value;
        duration += span;
    }
    return duration ? ' ｜ 过去一分钟 ' + percent(sum / duration) : '';
}
let trend = [];
const gpuNumbers = new Map();
function metricCard(label, data, select) {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = '<h3></h3><div class="readings"><div>实时占用<strong></strong></div><div>近 1 分钟平均<strong class="mean"></strong></div></div><div class="plot"><div class="ticks"><span>100%</span><span>50%</span><span>0%</span></div><div><svg viewBox="0 0 300 76" preserveAspectRatio="none" role="img"><path d="M0 2H300 M0 38H300 M0 74H300" stroke="var(--border)" fill="none"/><path stroke="var(--chart)" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/></svg><div class="axis"><span>−60 秒</span><span>−30 秒</span><span>现在</span></div></div></div>';
    card.querySelector('h3').textContent = label;
    card.querySelector('strong').textContent = percent(select(data));
    card.querySelector('.mean').textContent = average(data.time, select).replace(/^ ｜ 过去一分钟 /, '') || '—';
    card.querySelector('svg').setAttribute('aria-label', label + ' 最近 60 秒占用趋势');
    let previous = null;
    const points = [];
    for (const sample of trend) {
        const value = select(sample);
        if (!Number.isFinite(value)) { previous = null; continue; }
        const x = (sample.time - data.time + 60000) / 200;
        const y = 74 - Math.max(0, Math.min(100, value)) * .72;
        const command = previous !== null && sample.time - previous <= 5000 ? 'L' : 'M';
        points.push(command + x.toFixed(2) + ' ' + y.toFixed(2));
        previous = sample.time;
    }
    card.querySelector('svg path:last-child').setAttribute('d', points.join(' '));
    return card;
}
async function sample() {
    try {
        const response = await fetch('/metrics', { cache: 'no-store' });
        const data = await response.json();
        if (!data) throw new Error();
        if (trend.at(-1)?.time === data.time && byId('metrics').childElementCount) return;
        trend.push(data);
        trend = trend.filter(sample => sample.time >= data.time - 60000);
        if (since !== null && data.time >= since && history.at(-1)?.time !== data.time) {
            history.push(data);
            while (history.length > 1 && history[1].time <= data.time - 60000) history.shift();
        }
        const cpu = metricCard('整机 CPU', data, s => s.cpu);
        cpu.classList.add('metric-cpu');
        const cards = [cpu];
        byId('gpu-count').textContent = '当前采到 ' + data.gpu.length + ' 个 GPU 适配器组';
        data.gpu.forEach(gpu => {
            if (!gpuNumbers.has(gpu.id)) gpuNumbers.set(gpu.id, gpuNumbers.size + 1);
            const label = 'GPU ' + gpuNumbers.get(gpu.id) + ' · ';
            for (const [key, name] of [['busy', '最忙引擎'], ['decode', 'Video Decode']]) {
                const card = metricCard(label + name, data, s => s.gpu.find(g => g.id === gpu.id)?.[key]);
                card.title = 'Windows 适配器 ' + gpu.id;
                cards.push(card);
            }
        });
        if (!data.gpu.length) {
            const missing = document.createElement('div');
            missing.className = 'metric';
            missing.textContent = 'GPU 未采到';
            cards.push(missing);
        }
        byId('metrics').replaceChildren(...cards);
    } catch {
        byId('gpu-count').textContent = 'GPU 采样暂不可用';
        byId('metrics').textContent = '等待本机采样，或采样暂不可用';
    } finally { setTimeout(sample, 750); }
}
sample();
