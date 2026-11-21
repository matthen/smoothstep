import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState, type FormEvent } from 'react';

import AppModal from '../app/AppModal';
import { routeFromLink, routeHash } from '../lib/routes';

interface OpenLinkProps {
  show: boolean;
  onHide(): void;
  onOpen(hash: string): void;
}

// Opens an animation from a smoothstep.io link, a GitHub gist, or the address of an animation file.
export default function OpenLink({show, onHide, onOpen}: OpenLinkProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setText("");
      setError(null);
    }
  }

  const open = (event: FormEvent) => {
    event.preventDefault();
    const route = routeFromLink(text);
    if (!route || route.kind === "anim" || route.kind === "tutorial") {
      setError("That isn't a link to an animation.");
      return;
    }
    onHide();
    onOpen(routeHash(route));
  };

  return (
    <AppModal opened={show} onClose={onHide} title="Open from link">
      <form onSubmit={open}>
        <Stack gap="sm">
          <Text size="sm">
            Paste a smoothstep.io link, a GitHub gist's address, or the address of an animation file
            (a <code>.smoothstep.json</code> file) on any website.
          </Text>
          <TextInput
            id="openLinkInput" aria-label="Link" placeholder="https://gist.github.com/…" value={text} data-autofocus
            error={error} onChange={event => {setText(event.target.value); setError(null);}}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onHide}>Cancel</Button>
            <Button type="submit" disabled={!text.trim()}>Open</Button>
          </Group>
        </Stack>
      </form>
    </AppModal>
  );
}
