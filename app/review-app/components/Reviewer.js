'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Drawer, Typography, Button, IconButton, TextField, Paper, Chip, Stack, Divider, Snackbar, Tooltip } from '@mui/material';
import AnnotationLayer from './AnnotationLayer';

const COURSE_URL = '/course';   // same-origin course route (see app/course/[[...path]]/route.js)
const STATUS_COLOR = { pending: '#5d6b86', comments: '#f97316', approved: '#34c759' };
const DRAWER = 230;

export default function Reviewer({ slideId }) {
  const router = useRouter();
  const [course, setCourse] = useState(null);
  const [state, setState] = useState({ slides: {} });
  const [summary, setSummary] = useState({ slides: [] });
  const [draftText, setDraftText] = useState('');
  const [draftAnn, setDraftAnn] = useState([]);
  const [viewing, setViewing] = useState(null); // saved comment being viewed (readOnly)
  const [snack, setSnack] = useState('');

  const loadCourse = () => fetch('/api/course').then((r) => r.json()).then((d) => { setCourse(d); setSummary(d.summary); });
  const loadState = () => fetch('/api/review').then((r) => r.json()).then((d) => { setState(d.state); setSummary(d.summary); });
  useEffect(() => { loadCourse(); loadState(); }, []);
  useEffect(() => { setDraftText(''); setDraftAnn([]); setViewing(null); }, [slideId]);

  const slides = course?.slides || [];
  const idx = useMemo(() => slides.findIndex((s) => s.id === slideId), [slides, slideId]);
  const slide = slides[idx];
  const entry = state.slides?.[slideId] || { status: 'pending', comments: [], approvedAt: null };
  const statusOf = (id) => (summary.slides || []).find((s) => s.id === id)?.status || 'pending';

  const go = (d) => { const n = idx + d; if (n >= 0 && n < slides.length) router.push(`/slide/${encodeURIComponent(slides[n].id)}`); };

  const post = (body) => fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).then((d) => { if (d.state) setState(d.state); if (d.summary) setSummary(d.summary); return d; });
  const saveComment = async () => { if (!draftText.trim() && !draftAnn.length) return; await post({ action: 'comment', slideId, text: draftText, annotations: draftAnn }); setDraftText(''); setDraftAnn([]); setSnack('Comment saved'); };
  const delComment = async (commentId) => { await post({ action: 'deleteComment', slideId, commentId }); if (viewing?.id === commentId) setViewing(null); };
  const approve = async () => { await post({ action: 'approve', slideId, approved: !entry.approvedAt }); setSnack(entry.approvedAt ? 'Approval removed' : 'Slide approved'); };
  const sendToClaude = async () => { const r = await fetch('/api/send-to-claude', { method: 'POST' }).then((x) => x.json()); setSnack(`Sent ${r.count} comment(s) to Claude`); };

  if (!course) return <Box sx={{ p: 6, color: 'text.secondary' }}>Loading…</Box>;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* LEFT — course index */}
      <Drawer variant="permanent" sx={{ width: DRAWER, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER, bgcolor: '#0d1322', borderRight: '1px solid #1d2638', boxSizing: 'border-box' } }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #1d2638' }}>
          <Button size="small" onClick={() => router.push('/flow')}>← Flowchart</Button>
          <Typography sx={{ fontSize: 13, color: '#7c8aa6', mt: 1 }}>{course.title}</Typography>
        </Box>
        <Box sx={{ overflow: 'auto', py: 1 }}>
          {slides.map((s) => (
            <Box key={s.id} onClick={() => router.push(`/slide/${encodeURIComponent(s.id)}`)}
              sx={{ px: 2, py: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, borderLeft: '3px solid',
                borderColor: s.id === slideId ? 'primary.main' : 'transparent', bgcolor: s.id === slideId ? '#15203a' : 'transparent', '&:hover': { bgcolor: '#131c30' } }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: STATUS_COLOR[statusOf(s.id)], flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || s.kicker || s.type}</Typography>
            </Box>
          ))}
        </Box>
      </Drawer>

      {/* CENTER + RIGHT */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* top bar */}
        <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid #1d2638' }}>
          <Typography sx={{ fontWeight: 700 }}>{slide?.title || slide?.kicker || slide?.type}</Typography>
          <Chip size="small" label={slide?.type} variant="outlined" />
          <Chip size="small" label={entry.approvedAt ? 'approved' : (entry.comments?.length ? 'comments' : 'pending')}
            sx={{ color: STATUS_COLOR[entry.approvedAt ? 'approved' : (entry.comments?.length ? 'comments' : 'pending')] }} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 13, color: '#7c8aa6' }}>{idx + 1} / {slides.length}</Typography>
          <Button variant="contained" color="warning" size="small" onClick={sendToClaude}>Send to Claude</Button>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* center — live slide + annotation overlay */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, p: 3, gap: 2 }}>
            <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: '74vh', mx: 'auto',
              border: '1px solid #1d2638', borderRadius: 2, overflow: 'hidden', bgcolor: '#000' }}>
              <iframe key={slideId} src={`${COURSE_URL}?s=${encodeURIComponent(slideId)}`} title="slide"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
              <AnnotationLayer key={(viewing?.id || 'draft') + slideId}
                initialShapes={viewing ? viewing.annotations : draftAnn}
                readOnly={!!viewing}
                onChange={viewing ? undefined : setDraftAnn} />
            </Box>
            {/* bottom nav */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
              <Button variant="outlined" disabled={idx <= 0} onClick={() => go(-1)}>← Prev</Button>
              {viewing && <Button size="small" onClick={() => setViewing(null)}>Exit comment view (draw new)</Button>}
              <Button variant="outlined" disabled={idx >= slides.length - 1} onClick={() => go(1)}>Next →</Button>
            </Box>
          </Box>

          {/* right — comments + approve */}
          <Box sx={{ width: 340, flexShrink: 0, borderLeft: '1px solid #1d2638', bgcolor: '#0d1322', p: 2.5, overflow: 'auto' }}>
            <Button fullWidth variant={entry.approvedAt ? 'outlined' : 'contained'} color="success" onClick={approve} sx={{ mb: 2 }}>
              {entry.approvedAt ? '✓ Approved — click to undo' : 'Approve this slide'}
            </Button>
            <Divider sx={{ my: 2, borderColor: '#1d2638' }} />
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Add a comment</Typography>
            <Typography sx={{ fontSize: 12, color: '#7c8aa6', mb: 1 }}>Draw on the slide (arrow / box / pen / text), then describe the change.</Typography>
            <TextField multiline minRows={3} fullWidth placeholder="Describe the change or mistake…" value={draftText} onChange={(e) => setDraftText(e.target.value)} sx={{ mb: 1 }} />
            <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 2 }}>
              <Chip size="small" label={`${draftAnn.length} annotation${draftAnn.length === 1 ? '' : 's'}`} />
              {draftAnn.length > 0 && <Button size="small" onClick={() => setDraftAnn([])}>clear drawing</Button>}
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" onClick={saveComment} disabled={!draftText.trim() && !draftAnn.length}>Save comment</Button>
            </Stack>
            <Divider sx={{ my: 2, borderColor: '#1d2638' }} />
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Comments ({entry.comments?.length || 0})</Typography>
            <Stack gap={1.2}>
              {(entry.comments || []).map((c) => (
                <Paper key={c.id} sx={{ p: 1.5, bgcolor: viewing?.id === c.id ? '#15203a' : '#141c2e', border: '1px solid #1d2638', cursor: 'pointer' }}
                  onClick={() => setViewing(viewing?.id === c.id ? null : c)}>
                  <Typography sx={{ fontSize: 14 }}>{c.text || <i style={{ color: '#7c8aa6' }}>(drawing only)</i>}</Typography>
                  <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 0.5 }}>
                    {c.annotations?.length > 0 && <Chip size="small" label={`✎ ${c.annotations.length}`} />}
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); delComment(c.id); }}>delete</Button>
                  </Stack>
                </Paper>
              ))}
              {!(entry.comments?.length) && <Typography sx={{ fontSize: 13, color: '#7c8aa6' }}>No comments yet.</Typography>}
            </Stack>
          </Box>
        </Box>
      </Box>
      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
