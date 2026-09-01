import { useEffect, useRef, useState } from 'react';
import { createPixiStage } from './pixiStage.js';

const initialSettings = {
  blur: 14,
  grain: 0.022,
  translucency: 0.48,
  shadowDistance: 30,
  shadowOpacity: 0.54,
  puppetOpacity: 0.93,
  glow: 0.18,
  partBlur: {},
  motion: true,
};

const layers = [
  ['01', '幕布层', '米白纤维纹理 + 呼吸噪声'],
  ['02', '光场层', '暖色径向光 · Screen 混合'],
  ['03', '柔影层', '离屏轮廓 + Gaussian Blur'],
  ['04', '皮影本体', '17 个 Woop 关节部件 + Leather Shader'],
  ['05', '后处理', 'Bright-pass Bloom + Noise + Vignette'],
];

function Range({ label, value, min, max, step = 1, suffix = '', onChange, disabled = false }) {
  return (
    <label className={`control ${disabled ? 'disabled' : ''}`}>
      <span>{label}</span><output>{value}{suffix}</output>
      <input disabled={disabled} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function partName(partId) {
  if (!partId) return '尚未选择';
  if (partId === 'part_015') return '鹤头 · part_015';
  if (partId === 'part_016') return '身体 · part_016';
  if (partId === 'part_017') return '双腿 · part_017';
  return `颈节 ${partId.slice(-3)} · ${partId}`;
}

export default function App() {
  const stageRef = useRef(null);
  const settingsRef = useRef({ ...initialSettings });
  const [settings, setSettings] = useState(initialSettings);
  const [selectedPart, setSelectedPart] = useState(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [runtime, setRuntime] = useState({ loading: true, parts: 0, joints: 0, renderer: '—', fps: 0, error: '' });
  Object.assign(settingsRef.current, settings);
  settingsRef.current.selectedPartId = selectedPart;

  useEffect(() => {
    let disposed = false;
    let cleanup;
    createPixiStage(stageRef.current, settingsRef.current, {
      onReady: (info) => !disposed && setRuntime((state) => ({ ...state, ...info, loading: false })),
      onFps: (fps) => !disposed && setRuntime((state) => ({ ...state, fps })),
      onPartSelect: (partId) => {
        if (disposed) return;
        setSelectedPart(partId);
        setControlsOpen(true);
      },
    }).then((destroy) => {
      if (disposed) destroy(); else cleanup = destroy;
    }).catch((error) => {
      if (!disposed) setRuntime((state) => ({ ...state, loading: false, error: error.message }));
    });
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setControlsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const update = (key, value) => setSettings((state) => ({ ...state, [key]: value }));
  const updatePartBlur = (value) => {
    if (!selectedPart) return;
    setSettings((state) => ({ ...state, partBlur: { ...state.partBlur, [selectedPart]: value } }));
  };
  const reset = () => setSettings({ ...initialSettings, partBlur: {} });
  const selectedBlur = selectedPart ? (settings.partBlur[selectedPart] ?? 0) : 0;

  return (
    <main className={`app-shell ${controlsOpen ? 'controls-open' : ''}`}>
      <section className="stage-panel">
        <header className="topbar">
          <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <div className="brand-copy">
            <span className="eyebrow">WOOP LAB / REALTIME STUDY</span>
            <h1>仙鹤 · 纸上光场</h1>
          </div>
          <div className="fps-meter" aria-label={`当前帧率 ${runtime.fps || 0} FPS`}>
            <output>{runtime.fps || '—'}</output><span>FPS</span>
            <i><b /><b /><b /><b /></i>
          </div>
          <div className={`live-pill ${runtime.error ? 'error' : ''}`}>
            <span />{runtime.error ? '渲染错误' : runtime.loading ? '载入中' : '实时渲染'}
          </div>
          <button
            className="settings-trigger"
            type="button"
            aria-label={controlsOpen ? '关闭皮影设置' : '打开皮影设置'}
            aria-controls="render-controls"
            aria-expanded={controlsOpen}
            onClick={() => setControlsOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M8 14v6" />
              <circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />
            </svg>
          </button>
        </header>

        <div className="stage-wrap">
          <div className="pixi-stage" ref={stageRef} />
          <div className="stage-caption">
            <span>移动指针控制灯位</span>
            <strong>点击仙鹤部件 · 单独调整模糊</strong>
          </div>
          <div className="corner-data top-left">LIGHT / 01</div>
          <div className="corner-data bottom-right">{runtime.fps || '—'} FPS</div>
          {runtime.error && <div className="error-card">{runtime.error}</div>}
        </div>
      </section>

      <button className="drawer-backdrop" aria-label="关闭设置" tabIndex={controlsOpen ? 0 : -1} onClick={() => setControlsOpen(false)} />
      <aside className="control-panel" id="render-controls" aria-hidden={!controlsOpen} inert={!controlsOpen}>
        <div className="panel-head">
          <div className="panel-head-row">
            <span className="eyebrow">RENDER PIPELINE</span>
            <button className="drawer-close" type="button" aria-label="关闭设置" onClick={() => setControlsOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <h2>皮影质感控制台</h2>
          <p>用 `animal-he-002.woop` 实时验证半透明皮革、纸幕和柔化投影。</p>
        </div>

        <section className="layer-stack">
          {layers.map(([number, name, detail], index) => (
            <div className="layer-row" key={number}>
              <span className="layer-number">{number}</span>
              <i style={{ '--delay': `${index * 0.18}s` }} />
              <div><strong>{name}</strong><small>{detail}</small></div>
            </div>
          ))}
        </section>

        <section className="controls">
          <div className="section-title"><span>现场参数</span><button onClick={reset}>复位</button></div>
          <Range label="边缘虚化" value={settings.blur} min={0} max={24} suffix=" px" onChange={(v) => update('blur', v)} />
          <Range label="纸张颗粒" value={Math.round(settings.grain * 1000)} min={0} max={90} suffix=" ‰" onChange={(v) => update('grain', v / 1000)} />
          <Range label="皮革透光" value={Math.round(settings.translucency * 100)} min={0} max={100} suffix="%" onChange={(v) => update('translucency', v / 100)} />
          <Range label="投影距离" value={settings.shadowDistance} min={0} max={120} suffix=" px" onChange={(v) => update('shadowDistance', v)} />
          <Range label="投影浓度" value={Math.round(settings.shadowOpacity * 100)} min={0} max={100} suffix="%" onChange={(v) => update('shadowOpacity', v / 100)} />
          <Range label="整体 Bloom 光晕" value={Math.round(settings.glow * 100)} min={0} max={100} suffix="%" onChange={(v) => update('glow', v / 100)} />
          <div className={`part-control ${selectedPart ? 'selected' : ''}`}>
            <div className="part-control-head">
              <span><small>SELECTED PART</small><strong>{partName(selectedPart)}</strong></span>
              {selectedPart && <button onClick={() => setSelectedPart(null)}>取消选择</button>}
            </div>
            <p>{selectedPart ? '拖动下方滑块，只柔化当前选中的部件。' : '直接点击舞台上的头、颈节、身体或腿部。'}</p>
            <Range label="选中部件模糊" value={selectedBlur} min={0} max={24} step={0.5} suffix=" px" disabled={!selectedPart} onChange={updatePartBlur} />
          </div>
          <label className="motion-toggle">
            <span><strong>骨骼呼吸</strong><small>长颈与身体的低频摆动</small></span>
            <input type="checkbox" checked={settings.motion} onChange={(event) => update('motion', event.target.checked)} />
            <i />
          </label>
        </section>

        <footer className="runtime">
          <div><span>RENDERER</span><strong>{runtime.renderer}</strong></div>
          <div><span>RIG</span><strong>{runtime.parts || '—'} PARTS / {runtime.joints || '—'} JOINTS</strong></div>
        </footer>
      </aside>
    </main>
  );
}
