import { Fab } from '@/components/fab';
import { useCatchUpControls, useQuickLogBusy } from '@/features/log-media/session/state';
import type { NormalizedMediaItem } from '@/types/media';

import type { LogRequest } from './log-request';

function readingLogRequest(item: NormalizedMediaItem): LogRequest | null {
  const description = `“${item.title}”`;
  const total = item.totalEpisodes != null && item.totalEpisodes > 0 ? item.totalEpisodes : undefined;
  switch (item.type) {
    case 'MANGA': {
      const reread = total != null && item.currentProgress >= total;
      const next = reread ? 1 : item.currentProgress + 1;
      return {
        item,
        description: reread
          ? `You’ve read every chapter of “${item.title}” — this starts a reread at chapter 1.`
          : description,
        title: reread ? 'Reread' : `Log chapter ${next}`,
        entryEpisodes: [next],
        ...(!reread && (total == null || total > next) ? { chapterRange: { from: next, total } } : {}),
      };
    }
    case 'BOOK':
      return {
        item,
        description,
        title: 'Log progress',
        reading: {
          finished: total != null && item.currentProgress >= total,
          page: item.currentProgress,
          ...(total != null ? { total } : {}),
        },
      };
    default:
      return null;
  }
}

export function ReadingLogButton({ item }: { item: NormalizedMediaItem }) {
  const { openLog } = useCatchUpControls();
  const busy = useQuickLogBusy(item.id);
  const request = readingLogRequest(item);
  if (request == null) return null;
  return (
    <Fab
      icon="eye-outline"
      label={`${request.title} of ${item.title.trim() || 'Untitled'}`}
      loading={busy}
      onPress={() => {
        if (!busy) openLog(request);
      }}
      size="sm"
      variant="log"
    />
  );
}
