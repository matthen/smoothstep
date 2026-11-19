import { Component, useState, type ReactNode } from 'react';
import { Button, Group } from '@mantine/core';

import * as archive from '../lib/archive';
import * as localStore from '../lib/localStore';
import { crashDocument } from './crashState';

function CrashScreen({error}: {error: Error}) {
  const [status, setStatus] = useState<string | null>(null);
  const editing = crashDocument();

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      setStatus(null);
    } catch (e) {
      console.error(e);
      setStatus("That didn't work either: " + String(e));
    }
  };

  const downloadCurrent = () => run(async () => {
    const now = Date.now();
    archive.download(await archive.animationFile({
      id: editing!.id ?? localStore.newId(), title: editing!.json.title,
      created: now, modified: now, thumbnail: null, json: editing!.json,
    }));
  });

  return (
    <div className="crashScreen">
      <h1>Something went wrong</h1>
      <p>
        smoothstep hit an error it couldn't recover from. Your saved animations are still in this browser.
        Before you reload, you can download the animation you were editing, including any unsaved changes.
      </p>
      <Group gap="xs" my="md">
        {editing && <Button onClick={() => void downloadCurrent()}>Download this animation</Button>}
        <Button variant="default" onClick={() => void run(async () => archive.download(await archive.exportAll()))}>
          Download all saved animations
        </Button>
        <Button variant="default" onClick={() => window.location.reload()}>Reload</Button>
      </Group>
      {status && <p className="crashStatus">{status}</p>}
      <pre>{error.stack ?? error.message}</pre>
    </div>
  );
}

export default class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }

  render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
