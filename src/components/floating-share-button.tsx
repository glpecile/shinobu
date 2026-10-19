import { useFloatingBackButtonTop } from '@/components/floating-back-button';
import { ShareButton } from '@/components/share-button';

export function FloatingShareButton({ href }: { href: string }) {
  const top = useFloatingBackButtonTop();
  return <ShareButton className="absolute right-4" href={href} style={{ top }} />;
}
