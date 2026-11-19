import { Badge, Text, Title } from '@mantine/core';
import { useEffect, useRef } from 'react';

import { EXAMPLES, exampleHref, examplePreview, exampleThumbnail, type Example } from '../lib/config';

const GROUPS: {key: Example["group"]; title: string}[] = [
  {key: "showcase", title: "Showcase"},
  {key: "basics", title: "Learn the basics"},
];

// A preview that plays while it's on screen, unless the viewer prefers less motion.
function Preview({example}: {example: Example}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <video
      ref={ref} src={examplePreview(example.id)} poster={exampleThumbnail(example.id)}
      muted loop playsInline preload="none" aria-hidden
    />
  );
}

// The bundled examples as cards, grouped, each opening the example.
export default function ExampleGallery({onOpen}: {onOpen(): void}) {
  return (
    <div className="exampleGallery">
      {GROUPS.map(group =>
        <section key={group.key}>
          <Title order={3} size="h6" c="dimmed" mb={8}>{group.title}</Title>
          <div className="exampleCards">
            {EXAMPLES.filter(example => example.group === group.key).map(example =>
              <a key={example.id} className="exampleCard" href={exampleHref(example.id)} onClick={onOpen}>
                <Preview example={example} />
                <span className="exampleText">
                  <Text component="span" fw={600} size="sm" className="exampleTitle">{example.title}</Text>
                  <Text component="span" size="xs" c="dimmed">{example.description}</Text>
                  <span className="exampleTags">
                    {example.teaches.map(tag =>
                      <Badge key={tag} size="xs" variant="light" color="gray" tt="none">{tag}</Badge>,
                    )}
                  </span>
                </span>
              </a>,
            )}
          </div>
        </section>,
      )}
    </div>
  );
}
