'use client';
import { useEffect, useRef, useState } from 'react';

// Native slide design space — annotations are stored in these coords (resolution-independent).
const NW = 1920, NH = 1080;
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5AC8FA', '#007AFF', '#AF52DE', '#FFFFFF'];
const TOOLS = [
  { id: 'select', label: 'Select', icon: '↖' },
  { id: 'arrow', label: 'Arrow', icon: '↗' },
  { id: 'rect', label: 'Box', icon: '▢' },
  { id: 'freehand', label: 'Pen', icon: '✎' },
  { id: 'text', label: 'Text', icon: 'T' },
];
let _n = 0;
const newId = () => `a_${Date.now()}_${_n++}`;

export default function AnnotationLayer({ initialShapes = [], onChange, readOnly = false }) {
  const svgRef = useRef(null);
  const [shapes, setShapes] = useState(initialShapes);
  const [drawing, setDrawing] = useState(null);
  const [tool, setTool] = useState('arrow');
  const [color, setColor] = useState('#FF3B30');
  const [stroke, setStroke] = useState(5);
  const [textPos, setTextPos] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const toolRef = useRef(tool), colorRef = useRef(color), strokeRef = useRef(stroke);
  toolRef.current = tool; colorRef.current = color; strokeRef.current = stroke;

  // re-sync when a genuinely different set comes in (don't wipe an in-progress drawing)
  const key = (a) => (a || []).map((s) => s.id).join(',') + ':' + (a || []).length;
  const initKey = key(initialShapes);
  useEffect(() => { setShapes(initialShapes); }, [initKey]); // eslint-disable-line

  const emit = (next) => { setShapes(next); onChange && onChange(next); };
  const toNative = (cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((cx - r.left) / r.width) * NW, ((cy - r.top) / r.height) * NH];
  };

  function onDown(e) {
    if (readOnly || toolRef.current === 'select') return;
    const [x, y] = toNative(e.clientX, e.clientY);
    const t = toolRef.current, c = colorRef.current, w = strokeRef.current;
    if (t === 'text') { setTextPos({ x, y }); return; }
    if (t === 'arrow') setDrawing({ id: newId(), type: 'arrow', x1: x, y1: y, x2: x, y2: y, color: c, strokeWidth: w });
    else if (t === 'rect') setDrawing({ id: newId(), type: 'rect', x, y, w: 0, h: 0, color: c, strokeWidth: w });
    else if (t === 'freehand') setDrawing({ id: newId(), type: 'freehand', points: [[x, y]], color: c, strokeWidth: w });
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drawing) return;
    const [x, y] = toNative(e.clientX, e.clientY);
    if (drawing.type === 'arrow') setDrawing({ ...drawing, x2: x, y2: y });
    else if (drawing.type === 'rect') setDrawing({ ...drawing, w: x - drawing.x, h: y - drawing.y });
    else if (drawing.type === 'freehand') setDrawing({ ...drawing, points: [...drawing.points, [x, y]] });
  }
  function onUp() {
    if (!drawing) return;
    let keep = true;
    if (drawing.type === 'arrow') keep = Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 8;
    else if (drawing.type === 'rect') keep = Math.abs(drawing.w) > 8 && Math.abs(drawing.h) > 8;
    else if (drawing.type === 'freehand') keep = drawing.points.length > 2;
    if (keep) emit([...shapes, drawing]);
    setDrawing(null);
  }
  function commitText(text) {
    if (text && textPos) emit([...shapes, { id: newId(), type: 'text', x: textPos.x, y: textPos.y, text, color: colorRef.current, fontSize: 30 }]);
    setTextPos(null);
  }
  const undo = () => emit(shapes.slice(0, -1));
  const clearAll = () => emit([]);

  const render = (s) => {
    const sw = s.strokeWidth || 4;
    if (s.type === 'arrow') {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), len = 26 + sw * 2;
      const a1 = ang + Math.PI - 0.4, a2 = ang + Math.PI + 0.4;
      return (<g key={s.id}>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${s.x2 + Math.cos(a1) * len},${s.y2 + Math.sin(a1) * len} ${s.x2},${s.y2} ${s.x2 + Math.cos(a2) * len},${s.y2 + Math.sin(a2) * len}`} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>);
    }
    if (s.type === 'rect') return <rect key={s.id} x={Math.min(s.x, s.x + s.w)} y={Math.min(s.y, s.y + s.h)} width={Math.abs(s.w)} height={Math.abs(s.h)} fill="none" stroke={s.color} strokeWidth={sw} rx={8} />;
    if (s.type === 'freehand') return <polyline key={s.id} points={s.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
    if (s.type === 'text') return <text key={s.id} x={s.x} y={s.y} fill={s.color} fontSize={s.fontSize || 30} fontWeight="700" fontFamily="Inter, sans-serif">{s.text}</text>;
    return null;
  };

  return (
    <>
      {!readOnly && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
          background: 'rgba(10,15,26,.92)', border: '1px solid #2a3550', borderRadius: 12, padding: 8, backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <button title={collapsed ? 'Show annotation tools' : 'Hide annotation tools'} onClick={() => setCollapsed(!collapsed)}
            style={{ width: 36, height: 30, borderRadius: 8, cursor: 'pointer', border: '1px solid #2a3550', background: collapsed ? '#1c2640' : 'transparent', color: '#9aa7bd', fontSize: 15 }}>{collapsed ? '✎' : '«'}</button>
          {!collapsed && (<>
            {TOOLS.map((t) => (
              <button key={t.id} title={t.label} onClick={() => setTool(t.id)}
                style={{ width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 16,
                  border: tool === t.id ? '2px solid #5b8cff' : '1px solid #2a3550', background: tool === t.id ? '#1c2640' : 'transparent', color: '#e7ecf5' }}>{t.icon}</button>
            ))}
            <span style={{ height: 1, width: 30, background: '#2a3550', margin: '2px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '1px solid #00000040' }} />
              ))}
            </div>
            <select value={stroke} onChange={(e) => setStroke(+e.target.value)} style={{ background: '#121826', color: '#e7ecf5', border: '1px solid #2a3550', borderRadius: 6, height: 28, width: 56 }}>
              {[2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w}px</option>)}
            </select>
            <span style={{ height: 1, width: 30, background: '#2a3550', margin: '2px 0' }} />
            <button onClick={undo} title="Undo" style={btn}>↶</button>
            <button onClick={clearAll} title="Clear" style={btn}>✕</button>
          </>)}
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${NW} ${NH}`} preserveAspectRatio="none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 4,
          cursor: readOnly ? 'default' : (tool === 'select' ? 'default' : 'crosshair'),
          touchAction: 'none', pointerEvents: readOnly ? 'none' : 'auto' }}>
        {shapes.map(render)}
        {drawing && render(drawing)}
      </svg>
      {textPos && !readOnly && (
        <input autoFocus placeholder="Type, then Enter" onKeyDown={(e) => { if (e.key === 'Enter') commitText(e.target.value); if (e.key === 'Escape') setTextPos(null); }} onBlur={(e) => commitText(e.target.value)}
          style={{ position: 'absolute', left: `${(textPos.x / NW) * 100}%`, top: `${(textPos.y / NH) * 100}%`, zIndex: 6, background: '#121826', color: color, border: '1px solid #5b8cff', borderRadius: 6, padding: '4px 8px', fontSize: 16 }} />
      )}
    </>
  );
}
const btn = { width: 32, height: 32, borderRadius: 8, cursor: 'pointer', border: '1px solid #2a3550', background: 'transparent', color: '#e7ecf5' };
