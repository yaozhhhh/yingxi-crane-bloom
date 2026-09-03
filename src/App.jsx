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
  motion: true,
};

function Range({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="control">
      <span>{label}</span><output>{value}{suffix}</output>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function App() {
  const stageRef = useRef(null);
  const settingsRef = useRef({ ...initialSettings });
  const [settings, setSettings] = useState(initialSettings);
  const [gradientEditing, setGradientEditing] = useState(false);
  const [runtime, setRuntime] = useState({ loading: true, fps: 0, error: '' });
  Object.assign(settingsRef.current, settings);
  settingsRef.current.gradientEditing = gradientEditing;

  useEffect(() => {
    let disposed = false;
    let cleanup;
    createPixiStage(stageRef.current, settingsRef.current, {
      onReady: (info) => !disposed && setRuntime((state) => ({ ...state, ...info, loading: false })),
      onFps: (fps) => !disposed && setRuntime((state) => ({ ...state, fps })),
      onGradientEditEnd: () => !disposed && setGradientEditing(false),
    }).then((destroy) => {
      if (disposed) destroy(); else cleanup = destroy;
    }).catch((error) => {
      if (!disposed) setRuntime((state) => ({ ...state, loading: false, error: error.message }));
    });
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    const clearOnEscape = (event) => {
      if (event.key === 'Escape') setGradientEditing(false);
    };
    window.addEventListener('keydown', clearOnEscape);
    return () => window.removeEventListener('keydown', clearOnEscape);
  }, []);

  const update = (key, value) => setSettings((state) => ({ ...state, [key]: value }));

  return (
    <main className="app-shell">
      <section className="stage-panel">
        <header className="topbar">
          <div className="woooo-logo">
            <svg viewBox="0 0 794 420" role="img" aria-labelledby="woooo-logo-title">
              <title id="woooo-logo-title">Woooo · 五天晴工作室</title>
              <filter id="remove-logo-orange" colorInterpolationFilters="sRGB">
                <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1.25 0 -0.2" />
              </filter>
              <image
                href={`${import.meta.env.BASE_URL}woooo-piying-logo.png`}
                width="794"
                height="420"
                filter="url(#remove-logo-orange)"
              />
            </svg>
          </div>
          <button
            className={`gradient-tool ${gradientEditing ? 'active' : ''}`}
            type="button"
            aria-label={gradientEditing ? '退出渐变模糊编辑' : '编辑渐变模糊'}
            aria-pressed={gradientEditing}
            onClick={() => setGradientEditing((active) => !active)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="gradient-tool-fill" x1="0" x2="1">
                  <stop offset="0" stopColor="#15100c" />
                  <stop offset="1" stopColor="#fff4dc" />
                </linearGradient>
              </defs>
              <rect x="3.5" y="5" width="17" height="14" rx="2" fill="url(#gradient-tool-fill)" />
              <path d="M6 15.5h5M6 12.5h8M6 9.5h11" />
            </svg>
          </button>
          <div className="fps-meter" aria-label={`当前帧率 ${runtime.fps || 0} FPS`}>
            <output>{runtime.fps || '—'}</output><span>FPS</span>
            <i><b /><b /><b /><b /></i>
          </div>
          <div className={`live-pill ${runtime.error ? 'error' : ''}`}>
            <span />{runtime.error ? '渲染错误' : runtime.loading ? '载入中' : '实时渲染'}
          </div>
        </header>

        <div className="stage-wrap">
          <div className="pixi-stage" ref={stageRef} />

          <section className="quick-controls" aria-label="皮影参数">
            <div className="quick-controls-head"><span>LIGHT CONTROL</span><i /></div>
            <div className="quick-controls-grid">
              <Range label="虚化" value={settings.blur} min={0} max={24} suffix=" px" onChange={(v) => update('blur', v)} />
              <Range label="浓度" value={Math.round(settings.shadowOpacity * 100)} min={0} max={100} suffix="%" onChange={(v) => update('shadowOpacity', v / 100)} />
              <Range label="距离" value={settings.shadowDistance} min={0} max={120} suffix=" px" onChange={(v) => update('shadowDistance', v)} />
              <Range label="透光" value={Math.round(settings.translucency * 100)} min={0} max={100} suffix="%" onChange={(v) => update('translucency', v / 100)} />
            </div>
          </section>

          {gradientEditing && (
            <div className="gradient-mode-hint" role="status">
              <i className="black" /><span>清晰</span>
              <strong>拖拽设置渐变</strong>
              <span>模糊</span><i className="white" />
            </div>
          )}

          <div className="stage-caption">
            <span>移动指针控制灯位 · 按住身体晃动</span>
            <strong>弹簧颈链与渐变模糊均支持触控</strong>
          </div>
          <div className="corner-data bottom-right">{runtime.fps || '—'} FPS</div>
          {runtime.error && <div className="error-card">{runtime.error}</div>}
        </div>
      </section>
    </main>
  );
}
