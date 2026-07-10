'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Paper, Typography, Button, Chip, Stack, LinearProgress, Snackbar } from '@mui/material';

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [snack, setSnack] = useState('');
  const load = () => fetch('/api/course').then((r) => r.json()).then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <Box sx={{ p: 6, color: 'text.secondary' }}>Loading…</Box>;

  const s = data.summary;
  const pct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
  const approve = async () => {
    await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approveAll' }) });
    setSnack('Course approved — Claude can now finalize & export the package.'); load();
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Box sx={{ px: 4, py: 2, borderBottom: '1px solid #1d2638', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: 2, background: 'linear-gradient(135deg,#1E3A8A,#14B8A6)' }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>SCORM Studio</Typography>
        <Typography sx={{ fontSize: 13, color: '#7c8aa6' }}>Review &amp; approve</Typography>
      </Box>

      <Box sx={{ p: 4 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7c8aa6', mb: 1.5 }}>Attached course</Typography>
        <Paper sx={{ p: 0, overflow: 'hidden', border: '1px solid #1d2638', maxWidth: 980 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 360px', p: 3.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.15 }}>{data.title}</Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
                <Chip size="small" label={`${s.total} slides`} />
                <Chip size="small" color="success" variant="outlined" label={`${s.approved} approved`} />
                <Chip size="small" sx={{ color: '#f97316', borderColor: '#f97316' }} variant="outlined" label={`${s.withComments} with comments`} />
                <Chip size="small" label={s.decision} color={s.decision === 'approved' ? 'success' : s.decision === 'changes_requested' ? 'warning' : 'default'} />
              </Stack>
              <Box sx={{ mt: 2.5 }}>
                <Typography sx={{ fontSize: 12, color: '#7c8aa6', mb: 0.5 }}>Review progress — {pct}% approved</Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
              <Stack direction="row" gap={1.5} sx={{ mt: 3 }} flexWrap="wrap">
                <Button variant="contained" onClick={() => router.push('/flow')}>Open review flowchart</Button>
                <Button variant="outlined" component="a" href="/course?s=title" target="_blank" rel="noopener">Final LMS preview ↗</Button>
                <Button variant="outlined" color="success" disabled={s.decision === 'approved'} onClick={approve}>Approve &amp; finalize</Button>
              </Stack>
              <Typography sx={{ fontSize: 12, color: '#7c8aa6', mt: 2 }}>
                The flowchart opens each slide in an LMS-accurate preview with review tools. “Final LMS preview” plays the finished course exactly as a learner will see it in an LMS.
              </Typography>
            </Box>
            <Box sx={{ flex: '0 0 auto', width: 380, minHeight: 240, background: 'linear-gradient(135deg,#0f172a,#1E3A8A 60%,#14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/course/assets/img-home.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} onError={(e) => { e.target.style.display = 'none'; }} />
            </Box>
          </Box>
        </Paper>
      </Box>
      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
