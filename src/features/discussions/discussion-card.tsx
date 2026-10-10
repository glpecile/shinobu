import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { Image } from '@/components/image';
import { PresstableOpacity } from '@/components/presstable';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/lib/cn';
import type { DiscussionBoard } from '@/lib/http/fourchan';
import { openExternalUrl } from '@/lib/open-external-url';
import { useThemeColor } from '@/lib/theme-color';

export interface DiscussionPreview {
  id: number;
  title: string;
  image: string;
}

function DiscussionThumbnail({ image, title }: { image: string; title: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(image === '' ? 'failed' : 'loading');
  const muted = useThemeColor('--color-muted');
  return (
    <View className="w-24 shrink-0 self-stretch items-center justify-center">
      {status === 'failed' && <Ionicons color={muted} name="image-outline" size={24} />}
      {status === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
      {image !== '' && status !== 'failed' && (
        <Image
          accessibilityLabel={`Opening-post image for ${title}`}
          className="absolute inset-0 w-full h-full"
          contentFit="cover"
          onError={() => setStatus('failed')}
          onLoad={() => setStatus('ready')}
          source={{ uri: image }}
        />
      )}
    </View>
  );
}

/** Compact external preview of a catalog's opening post. */
export function DiscussionCard({ thread, board }: {
  thread: DiscussionPreview; board: DiscussionBoard;
}) {
  const muted = useThemeColor('--color-muted');
  const { width } = useWindowDimensions();
  const title = thread.title.trim() || `/${board}/ thread #${thread.id}`;
  return (
    <PresstableOpacity
      accessibilityLabel={`Open ${title} on 4chan /${board}/, thread ${thread.id}`}
      className="rounded-xl"
      onPress={() => openExternalUrl(`https://boards.4chan.org/${board}/thread/${thread.id}`)}
    >
      {/* A 288pt card needs 336pt with the detail screen's two 24pt gutters. */}
      <View className={cn('min-h-28 flex-row rounded-xl overflow-hidden bg-surface border border-border/60', width < 336 ? 'w-64' : 'w-72')}>
        <DiscussionThumbnail image={thread.image} key={thread.image} title={title} />
        <View className="flex-1 min-w-0 p-3 gap-2 justify-between">
          <Text className="text-foreground font-sans-semibold text-sm leading-5" numberOfLines={3}>
            {title}
          </Text>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-muted font-sans text-xs flex-1 min-w-0">/{board}/ · #{thread.id}</Text>
            <View className="shrink-0"><Ionicons color={muted} name="open-outline" size={14} /></View>
          </View>
        </View>
      </View>
    </PresstableOpacity>
  );
}
