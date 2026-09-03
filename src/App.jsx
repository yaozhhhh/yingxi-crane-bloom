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

function Range({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="control">
      <span>{label}</span><output>{value}{suffix}</output>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function partName(partId) {
  if (partId === 'part_015') return '鹤头';
  if (partId === 'part_016') return '身体';
  if (partId === 'part_017') return '双腿';
  return `颈片 ${partId?.slice(-3)}`;
}

export default function App() {
  const stageRef = useRef(null);
  const partEditorRef = useRef(null);
  const settingsRef = useRef({ ...initialSettings });
  const [settings, setSettings] = useState(initialSettings);
  const [selectedPart, setSelectedPart] = useState(null);
  const [runtime, setRuntime] = useState({ loading: true, fps: 0, error: '' });
  Object.assign(settingsRef.current, settings);
  settingsRef.current.selectedPartId = selectedPart;

  useEffect(() => {
    let disposed = false;
    let cleanup;
    createPixiStage(stageRef.current, settingsRef.current, {
      onReady: (info) => !disposed && setRuntime((state) => ({ ...state, ...info, loading: false })),
      onFps: (fps) => !disposed && setRuntime((state) => ({ ...state, fps })),
      onPartSelect: (partId) => !disposed && setSelectedPart(partId),
      onPartClear: () => !disposed && setSelectedPart(null),
      onPartAnchor: ({ x, y }) => {
        if (!disposed && partEditorRef.current) {
          partEditorRef.current.style.left = `${x}px`;
          partEditorRef.current.style.top = `${y}px`;
        }
      },
    }).then((destroy) => {
      if (disposed) destroy(); else cleanup = destroy;
    }).catch((error) => {
      if (!disposed) setRuntime((state) => ({ ...state, loading: false, error: error.message }));
    });
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    const clearOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedPart(null);
    };
    window.addEventListener('keydown', clearOnEscape);
    return () => window.removeEventListener('keydown', clearOnEscape);
  }, []);

  const update = (key, value) => setSettings((state) => ({ ...state, [key]: value }));
  const updatePartBlur = (value) => {
    if (!selectedPart) return;
    setSettings((state) => ({ ...state, partBlur: { ...state.partBlur, [selectedPart]: value } }));
  };
  const selectedBlur = selectedPart ? (settings.partBlur[selectedPart] ?? 0) : 0;

  return (
    <main className="app-shell">
      <section className="stage-panel">
        <header className="topbar">
          <div className="woooo-logo" aria-label="woooo piying">
            <strong>woooo</strong>
            <span>PIYING</span>
          </div>
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

          {selectedPart && (
            <div
              className="part-blur-popover"
              ref={partEditorRef}
              role="dialog"
              aria-label={`${partName(selectedPart)}模糊程度`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="part-popover-head">
                <span><small>SELECTED</small><strong>{partName(selectedPart)}</strong></span>
                <output>{selectedBlur} px</output>
              </div>
              <label>
                <span>模糊程度</span>
                <input
                  aria-label={`${partName(selectedPart)}模糊程度`}
                  type="range"
                  min="0"
                  max="24"
                  step="0.5"
                  value={selectedBlur}
                  onChange={(event) => updatePartBlur(Number(event.target.value))}
                />
              </label>
            </div>
          )}

          <div className="stage-caption">
            <span>移动指针控制灯位</span>
            <strong>点击片儿调整模糊 · 点击空白处关闭</strong>
          </div>
          <div className="corner-data bottom-right">{runtime.fps || '—'} FPS</div>
          {runtime.error && <div className="error-card">{runtime.error}</div>}
        </div>
      </section>
    </main>
  );
}
