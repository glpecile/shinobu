import { useIsFocused } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { usePushRoute } from '@/lib/navigation';
import { routes } from '@/lib/routes';

/**
 * The first-run screens' call to action (Home, Diary). Opening Settings can
 * take a beat on web while its route loads, so the button spins from the
 * press until this screen loses focus.
 */
export function ConnectTrackerButton({ className }: { className?: string }) {
  const pushRoute = usePushRoute();
  const focused = useIsFocused();
  const [pressed, setPressed] = useState(false);
  // Tabs stay mounted, so clear the press once the screen blurs, during render.
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
