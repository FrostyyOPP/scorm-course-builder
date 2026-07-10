'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Paper, Typography, Button, Chip } from '@mui/material';

const TYPE_ICON = { title: '🏁', home: '◫', intro: '▶', video: '▶', lessonIndex: '☰', moduleIndex: '▣', reading: '📖', quizIntro: '❓', result: '🏆', outro: '▶', exit: '🚪' };
const STATUS_COLOR = { pending: '#5d6b86', comments: '#f97316', approved: '#34c759' };
const COL = 230, ROW = 150, NODE_W = 180, NODE_H = 76;

export default function Flow() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [z, setZ] = useState(0.7);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const vpRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => { fetch('/api/course').then((r) => r.json()).then(setData); }, []);

  // ctrl+wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return; e.preventDefault();
      const rect = vp.getBoundingClientRect(); const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setZ((prevZ) => {
        const nz = Math.min(2.5, Math.max(0.2, prevZ * (e.deltaY < 0 ? 1.12 : 0.89)));
        setPan((p) => ({ x: cx - ((cx - p.x) / prevZ) * nz, y: cy - ((cy - p.y) / prevZ) * nz }));
        return nz;
      });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [data]);

  const { nodes, edges, w, h } = useMemo(() => layout(data), [data]);
  if (!data) return <Box sx={{ p: 6, color: 'text.secondary' }}>Loading course flow…</Box>;
  const statusOf = (id) => (data.summary.slides || []).find((s) => s.id === id)?.status || 'pending';

  const onDown = (e) => { if (e.target.closest('[data-node]')) return; drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e) => { if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onUp = () => { drag.current = null; };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid #1d2638', zIndex: 2 }}>
        <Button size="small" onClick={() => router.push('/')}>← Home</Button>
        <Typography sx={{ fontWeight: 800 }}>{data.title}</Typography>
        <Typography sx={{ fontSize: 12, color: '#7c8aa6' }}>Course flow — drag to pan · Ctrl+scroll to zoom · click a node to review</Typography>
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label={data.summary.decision} color={data.summary.decision === 'approved' ? 'success' : data.summary.decision === 'changes_requested' ? 'warning' : 'default'} />
        <Button size="small" variant="outlined" onClick={() => setZ((v) => Math.min(2.5, v * 1.2))}>＋</Button>
        <Button size="small" variant="outlined" onClick={() => setZ((v) => Math.max(0.2, v * 0.83))}>－</Button>
        <Button size="small" variant="outlined" onClick={() => { setZ(0.7); setPan({ x: 60, y: 40 }); }}>Reset</Button>
      </Box>
      <Box ref={vpRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        sx={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: drag.current ? 'grabbing' : 'grab',
          background: 'radial-gradient(circle at 30% 20%, #121a2e 0%, #0b0f1a 70%)' }}>
        <Box sx={{ position: 'absolute', transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${z})`, width: w, height: h }}>
          <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {edges.map((e, i) => {
              const a = nodes[e.from], b = nodes[e.to]; if (!a || !b) return null;
              const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y;
              const my = (y1 + y2) / 2;
              return <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke="#2a3958" strokeWidth={2} />;
            })}
          </svg>
          {Object.values(nodes).map((n) => (
            <Paper key={n.id} data-node elevation={0} onClick={() => router.push(`/slide/${encodeURIComponent(n.slideId)}`)}
              sx={{ position: 'absolute', left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H, p: 1.2, cursor: 'pointer',
                bgcolor: '#141c2e', border: '2px solid', borderColor: STATUS_COLOR[statusOf(n.slideId)], borderRadius: 2,
                transition: 'transform .1s', '&:hover': { transform: 'scale(1.04)', boxShadow: '0 8px 22px rgba(0,0,0,.5)' } }}>
              <Typography sx={{ fontSize: 11, color: '#7c8aa6' }}>{TYPE_ICON[n.type] || '•'} {n.label}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.title}</Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// Build the course hierarchy + tidy-tree layout (top-down).
function layout(data) {
  if (!data) return { nodes: {}, edges: [], w: 1000, h: 600 };
  const slides = data.slides || [];
  const byId = Object.fromEntries(slides.map((s) => [s.id, s]));
  const children = {}; const used = new Set();
  const add = (p, c) => { if (!byId[c]) return; (children[p] = children[p] || []).push(c); };
  slides.forEach((s) => ['modules', 'lessons', 'videos'].forEach((k) => (s[k] || []).forEach((c) => { if (byId[c.target]) { add(s.id, c.target); used.add(c.target); } })));
  // chain title → intro → home
  const has = (id) => !!byId[id];
  let root = has('title') ? 'title' : 'home';
  if (has('title') && has('intro')) { add('title', 'intro'); used.add('intro'); }
  if (has('intro') && has('home')) { add('intro', 'home'); used.add('home'); }
  else if (has('title') && has('home')) { add('title', 'home'); used.add('home'); }
  // place the rest under their module (nearest preceding moduleIndex); collapse questions
  let curMod = null;
  slides.forEach((s) => {
    if (s.type === 'moduleIndex') curMod = s.id;
    if (s.id === root || used.has(s.id) || s.id === 'intro' || s.id === 'home') return;
    if (s.type === 'question') return;            // collapsed into the quiz-intro node
    if (s.id === 'outro' || s.type === 'exit') { add('home', s.id); used.add(s.id); return; }
    if (curMod) { add(curMod, s.id); used.add(s.id); }
  });

  const nodes = {}; let leaf = 0;
  const qCount = {}; slides.forEach((s) => { if (s.type === 'question') { const m = s.moduleKey || ''; qCount[m] = (qCount[m] || 0) + 1; } });
  function place(id, depth) {
    const s = byId[id]; if (!s) return;
    const label = s.type === 'quizIntro' ? `Quiz · ${qCount[s.moduleKey] || (s.count || '')} Qs` : (s.kicker || s.type);
    const kids = children[id] || [];
    const node = { id, slideId: id, type: s.type, label, title: s.title || s.kicker || s.type, y: depth * ROW };
    nodes[id] = node;
    if (!kids.length) { node.x = leaf++ * COL; }
    else { kids.forEach((k) => place(k, depth + 1)); const xs = kids.map((k) => nodes[k] && nodes[k].x).filter((v) => v != null); node.x = xs.reduce((a, b) => a + b, 0) / xs.length; }
  }
  place(root, 0);
  const edges = [];
  Object.keys(children).forEach((p) => (children[p] || []).forEach((c) => { if (nodes[c]) edges.push({ from: p, to: c }); }));
  const xs = Object.values(nodes).map((n) => n.x), ys = Object.values(nodes).map((n) => n.y);
  const w = (Math.max(...xs, 0) + NODE_W + 80), h = (Math.max(...ys, 0) + NODE_H + 80);
  return { nodes, edges, w, h };
}
