import { Button, Group, Menu, SimpleGrid, Text, Title } from '@mantine/core';
import { useEffect, useState, type ReactNode } from 'react';
import { TbBulb, TbRoute, TbSchool } from 'react-icons/tb';

import AppModal from '../app/AppModal';
import { usePhone } from '../app/usePhone';
import { asset, documentHref, DOCS_URL, REPO_URL, TUTORIAL_HREF } from '../lib/config';
import { listDocuments, type DocumentSummary } from '../lib/localStore';
import ExampleGallery from './ExampleGallery';
import ImageWithFallback from './ImageWithFallback';
import { WELCOME_TIPS, welcomeTipIndex, welcomeTipShown } from './welcomeTips';

interface SplashProps {
  show: boolean;
  onHide(): void;
  onTour(): void;
  // Once the tour has been taken, Continue becomes the main button.
  tourTaken: boolean;
}

function LinkItem({href, onClick, icon, children}: {
  href: string; onClick?(): void; icon: ReactNode; children: ReactNode;
}) {
  const external = !href.startsWith("#");
  return (
    <a
      className="linkItem" href={href} onClick={onClick}
      {...(external ? {target: "_blank", rel: "noreferrer"} : {})}
    >
      {icon}<span>{children}</span>
    </a>
  );
}

// Mounted each time the dialog opens, so each visit starts on the next tip.
function WelcomeTip() {
  const [index, setIndex] = useState(welcomeTipIndex);
  useEffect(() => welcomeTipShown(index), [index]);
  return (
    <section className="welcomeTip" aria-label="Did you know?">
      <Text size="sm" fw={600} className="welcomeTipTitle"><TbBulb aria-hidden />Did you know?</Text>
      <Text size="sm" className="welcomeTipText">{WELCOME_TIPS[index]}</Text>
      <Button
        variant="subtle" size="compact-xs" color="gray" className="welcomeTipNext"
        onClick={() => setIndex(i => (i + 1) % WELCOME_TIPS.length)}
      >
        Next tip
      </Button>
    </section>
  );
}

export default function Splash({show, onHide, onTour, tourTaken}: SplashProps) {
  const [recentDocs, setRecentDocs] = useState<DocumentSummary[]>([]);
  const phone = usePhone();

  useEffect(() => {
    if (show) {
      listDocuments().then(docs => setRecentDocs(docs.slice(0, 3))).catch(console.log);
    }
  }, [show]);

  const thumbnail = (src: string) =>
    <ImageWithFallback src={src} width="28" height="28" alt="" className="thumbnail" />;

  return (
    <AppModal
      opened={show} onClose={onHide} size={960} fullScreen={phone} classNames={{content: "splash"}}
      // On a phone the dialog fills the screen, where a ✕ reads as closing the site, so the pinned buttons do it.
      withCloseButton={!phone}
      title={<span className="splashTitle"><img src={asset("images/logo.svg")} width="20" height="20" alt="" /><span>smoothstep<i>.io</i></span></span>}
    >
      <SimpleGrid cols={{base: 1, sm: 2}} spacing="xl">
        <div>
          <Title order={1} size="h2" mb="sm">Welcome</Title>
          <Text mb="sm">
            smoothstep.io is a toolkit for building animations in the WebGL Shader language.
          </Text>
          <Text mb="md" c="dimmed" size="sm">
            Animations and the images you add are saved in this browser. Use File &rarr; Open
            to download them as files, or to open files saved elsewhere.
          </Text>
          <WelcomeTip />
        </div>
        <div>
          {recentDocs.length > 0 &&
            <>
              <Title order={2} size="h5" mb="xs">Your recent animations</Title>
              <div className="linkList">
                {recentDocs.map(doc =>
                  <LinkItem
                    href={documentHref(doc.id)} key={doc.id} onClick={onHide}
                    icon={doc.thumbnail ? thumbnail(doc.thumbnail) : <span className="thumbnail" />}
                  >
                    {doc.title}
                  </LinkItem>,
                )}
              </div>
            </>
          }
        </div>
      </SimpleGrid>
      <Title order={2} size="h5" mt="xl" mb="sm">Examples</Title>
      <ExampleGallery onOpen={onHide} />
      <Text size="sm" c="dimmed" mt="lg" className="splashFooter">
        <a href={DOCS_URL} target="_blank" rel="noreferrer">Documentation</a>
        {" · "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">Source code</a>
      </Text>
      {phone ?
        // On a phone, one Learn button for the two ways to learn, so Continue stands out as the way in.
        <Group mt="xl" className="splashActions" wrap="nowrap">
          <Menu position="top-start">
            <Menu.Target>
              <Button variant="default" leftSection={<TbSchool />}>Learn</Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component="a" href={TUTORIAL_HREF} onClick={onHide} leftSection={<TbSchool />}>
                Tutorial
              </Menu.Item>
              <Menu.Item onClick={onTour} leftSection={<TbRoute />}>Take the tour</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button onClick={onHide}>Continue</Button>
        </Group> :
      <Group justify="flex-end" mt="xl" className="splashActions">
        <Button variant="default" component="a" href={TUTORIAL_HREF} onClick={onHide}>Tutorial</Button>
        <Button variant={tourTaken ? "default" : "filled"} onClick={onTour} data-autofocus={!tourTaken || undefined}>
          Take the tour
        </Button>
        <Button variant={tourTaken ? "filled" : "default"} onClick={onHide} data-autofocus={tourTaken || undefined}>
          Continue
        </Button>
      </Group>}
    </AppModal>
  );
}
