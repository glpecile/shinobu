import { useIsFocused } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';

export function ConnectTrackerButton({ className }: { className?: string }) {
  const pushRoute = usePushRoute();
  const focused = useIsFocused();
  const [pressed, setPressed] = useState(false);
  const [wasFocused, setWasFocused] = useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (!focused) setPressed(false);
  }

  return (
    <Button
      {...(className != null ? { className } : {})}
      icon={<Button.Icon name="link-outline" />}
      label="Connect a tracker"
      loading={pressed}
      onPress={() => {
        if (pushRoute(routes.settings)) setPressed(true);
      }}
    />
  );
}
