import Reviewer from '../../../components/Reviewer';
export const dynamic = 'force-dynamic';
export default function Page({ params }) {
  return <Reviewer slideId={decodeURIComponent(params.id)} />;
}
