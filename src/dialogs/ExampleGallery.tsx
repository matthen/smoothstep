// The bundled examples as cards in groups, each opening its example, in the welcome and Open dialogs.
import { Badge, Text, Title } from '@mantine/core';
import { useRef } from 'react';

import { EXAMPLES, exampleHref, examplePreview, exampleThumbnail, type Example } from '../lib/config';

const GROUPS: {key: Example["group"]; title: string}[] = [
  {key: "showcase", title: "Showcase"},
  {key: "basics", title: "Learn the basics"},
];

// A card whose preview plays only while it's pointed at or focused, so the gallery stays calm.
// Nothing downloads until then; touch screens show the still thumbnail.
function ExampleCard({example, onOpen}: {example: Example; onOpen(): void}) {
  const video = useRef<HTMLVideoElement>(null);
  const play = () => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.current?.play().catch(() => {});
    }
  };
  const pause = () => video.current?.pause();
  return (
    <a
      className="exampleCard" href={exampleHref(example.id)} onClick={onOpen}
      onPointerEnter={event => event.pointerType === "mouse" && play()} onPointerLeave={pause}
      onFocus={play} onBlur={pause}
    >
      <video
        ref={video} src={examplePreview(example.id)} poster={exampleThumbnail(example.id)}
        muted loop playsInline preload="none" aria-hidden
      />
      <span className="exampleText">
        <Text component="span" fw={600} size="sm" className="exampleTitle">{example.title}</Text>
        <Text component="span" size="xs" c="dimmed">{example.description}</Text>
        <span className="exampleTags">
          {example.teaches.map(tag =>
            <Badge key={tag} size="xs" variant="light" color="gray" tt="none">{tag}</Badge>,
          )}
        </span>
      </span>
    </a>
  );
}

export default function ExampleGallery({onOpen}: {onOpen(): void}) {
  return (
    <div className="exampleGallery">
      {GROUPS.map(group =>
        <section key={group.key}>
          <Title order={3} size="h6" c="dimmed" mb={8}>{group.title}</Title>
          <div className="exampleCards">
            {EXAMPLES.filter(example => example.group === group.key).map(example =>
              <ExampleCard key={example.id} example={example} onOpen={onOpen} />,
            )}
          </div>
        </section>,
      )}
    </div>
  );
}
