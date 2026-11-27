import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';

import { useLatest } from '../../lib/useLatest';
import { appUpdates, updateIfFresh } from '../../pwa/updates';
import { confirmLeaving, hasConfirmedLeaving, useHashLinks } from '../routing';

// Asks before unsaved changes are lost to a link, closing the page, or reloading into a new version.
export function useUnsavedGuards(hasUnsavedChanges: boolean) {
  useHashLinks(hasUnsavedChanges);

  // A new version installed in the background. A page that has only just opened reloads into it at
  // once; otherwise reloading asks first, as leaving the page does.
  const unsavedRef = useLatest(hasUnsavedChanges);
  useEffect(() => appUpdates()?.onReady(() => {
    if (updateIfFresh(unsavedRef.current)) {
      return;
    }
    notifications.show({
      id: "update", autoClose: false, title: "A new version of smoothstep.io is ready",
      message: (
        <Group gap="xs" mt={4}>
          <Text size="sm">Reload to start using it.</Text>
          <Button size="compact-sm" onClick={() => {
            if (confirmLeaving(unsavedRef.current)) {
              appUpdates()?.apply();
            }
          }}>Reload</Button>
        </Group>
      ),
    });
  }), [unsavedRef]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !hasConfirmedLeaving()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);
}
