// The Import dialog, which adds animations to this browser from files, or from a smoothstep.io link, a GitHub
// gist, or the address of an animation file.
import { Button, Divider, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState, type SubmitEvent } from 'react';
import { TbFileImport } from 'react-icons/tb';

import AppModal from '../app/AppModal';
import { routeFromLink, type Route } from '../lib/routes';

interface ImportProps {
  show: boolean;
  onHide(): void;
  onChooseFiles(): void;
  // Adds the animation at a link to the user's animations; rejects with a message to show.
  onImportLink(route: Route): Promise<void>;
}

export default function Import({show, onHide, onChooseFiles, onImportLink}: ImportProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setText("");
      setError(null);
    }
  }

  const importLink = (event: SubmitEvent) => {
    event.preventDefault();
    const route = routeFromLink(text);
    if (!route || route.kind === "anim" || route.kind === "tutorial") {
      setError("That isn't a link to an animation.");
      return;
    }
    setBusy(true);
    onImportLink(route).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Couldn't import that animation.");
    }).finally(() => setBusy(false));
  };

  return (
    // Closing can't stop a link that's loading, so it waits until the link is imported or fails.
    <AppModal
      opened={show} onClose={onHide} title="Import"
      closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}
    >
      <Stack gap="sm">
        <Text size="sm">
          Adds animations to the ones saved in this browser. Choose an animation file you downloaded, or a
          zip of them.
        </Text>
        <Button variant="default" leftSection={<TbFileImport />} onClick={onChooseFiles} disabled={busy}>
          Choose files…
        </Button>
        <Divider label="or" labelPosition="center" />
        <form onSubmit={importLink}>
          <Stack gap="sm">
            <Text size="sm">
              Paste a smoothstep.io link, a GitHub gist's address, or the address of an animation file
              (a <code>.smoothstep.json</code> file) on any website.
            </Text>
            <TextInput
              id="importLinkInput" aria-label="Link" placeholder="https://gist.github.com/…" value={text} data-autofocus
              error={error} onChange={event => {setText(event.target.value); setError(null);}}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onHide} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={!text.trim()} loading={busy}>Import link</Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </AppModal>
  );
}
