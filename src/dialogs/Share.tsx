import { ActionIcon, Alert, Button, Group, Stack, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core';
import { useMemo, useState } from 'react';
import { TbCheck, TbCopy, TbDownload, TbQrcode } from 'react-icons/tb';
import { encode, renderSVG } from 'uqr';

import AppModal from '../app/AppModal';
import CopyText from '../app/CopyText';
import { download } from '../lib/archive';
import { DOC_SECTIONS, docsSiteHref } from '../lib/docLinks';
import type { AnimationDocument } from '../lib/document';
import { routeFromLink, routeHash } from '../lib/routes';
import { appLink, encodeDocument, userImageSlots } from '../lib/share';

interface ShareProps {
  show: boolean;
  doc: AnimationDocument;
  // The link the animation was opened from, while it's unchanged, to share instead of a new one.
  source: string | null;
  onHide(): void;
  onMessage(text: string): void;
  onDownload(): void;
}

// The link that opens an animation file from a pasted gist or file address, or why there isn't one.
function linkToFile(address: string): {link: string} | {error: string} | null {
  let text = address.trim();
  if (!text) {
    return null;
  }
  if (/^[\w-]+(\.[\w-]+)+\//.test(text)) {
    text = "https://" + text;  // Typed without the https://.
  }
  const route = routeFromLink(text);
  if (route?.kind !== "gist" && route?.kind !== "url") {
    return {error: "That isn't the address of a gist or a file."};
  }
  if (route.kind === "url" && !route.url.startsWith("https:")) {
    return {error: "Use the file's https address. Browsers won't let smoothstep.io read it over http."};
  }
  return {link: appLink(routeHash(route))};
}

function Copy({value}: {value: string}) {
  return (
    <CopyText value={value}>
      {({copied, copy}) => (
        <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
          <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label="Copy">
            {copied ? <TbCheck /> : <TbCopy />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyText>
  );
}

// A QR code for the link, at 4px a square so phones can read it, or null when the link is too
// long to fit in one.
function qrCode(text: string): {src: string; width: number} | null {
  try {
    const {size} = encode(text, {ecc: "L", border: 2});
    return {
      src: "data:image/svg+xml," + encodeURIComponent(renderSVG(text, {ecc: "L", border: 2})),
      width: 4 * size,
    };
  } catch {
    return null;
  }
}

export function embedCode(doc: AnimationDocument, src: string): string {
  const [w, h] = doc.aspectRatio;
  const width = 512;
  const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<iframe src="${attribute(src)}" width="${width}" height="${Math.round(width * h / w)}" ` +
    `title="${attribute(doc.title)}" style="border: 0" allowfullscreen></iframe>`;
}

// Ways to share the open animation: a link that carries it, a QR code of that link, a link to its
// file online, code to show it playing on a website, and a player file.
export default function Share({show, doc, source, onHide, onMessage, onDownload}: ShareProps) {
  const [showQR, setShowQR] = useState(false);
  const [making, setMaking] = useState(false);
  const [fileAddress, setFileAddress] = useState("");
  const fileLink = useMemo(() => linkToFile(fileAddress), [fileAddress]);
  // Only worked out while the dialog is open, from the animation as it is then.
  const shared = useMemo(() => {
    if (!show) {
      return null;
    }
    const hash = source ?? "#share/" + encodeDocument(doc);
    const link = appLink(hash);
    return {link, embed: embedCode(doc, appLink(hash, "embed")), missing: source ? [] : userImageSlots(doc)};
  }, [show, doc, source]);
  const qr = useMemo(() => showQR && shared ? qrCode(shared.link) : null, [showQR, shared]);

  const downloadPlayer = async () => {
    setMaking(true);
    try {
      const {playerFile} = await import('../player/playerFile');
      download(await playerFile(doc, shared && shared.missing.length === 0 ? shared.link : null));
    } catch (error) {
      console.error(error);
      onMessage("Error making the player file.");
    } finally {
      setMaking(false);
    }
  };

  return (
    <AppModal
      opened={show} onClose={() => {setShowQR(false); setFileAddress(""); onHide();}} title="Share" size="lg"
    >
      {shared &&
        <Stack gap="lg">
          <Stack gap="xs">
            <Title order={4}>Link</Title>
            <Text size="sm">
              Anyone with this link can play the animation and change their own copy.
              {source
                ? " It opens the animation from where you opened it, as long as that's still there."
                : " The whole animation is in the link, so nothing is uploaded and the link keeps working."}
            </Text>
            <TextInput
              readOnly value={shared.link} aria-label="Link" rightSection={<Copy value={shared.link} />}
              onFocus={event => event.currentTarget.select()}
            />
            {shared.missing.length > 0 &&
              <Alert color="yellow">
                A link can't carry the images and videos you added yourself, so {shared.missing.join(", ")} will be
                empty for anyone who opens it. To share those too, put the animation file online and make a link to
                it, below.
              </Alert>}
            <Group>
              <Button
                variant="default" leftSection={<TbQrcode />} onClick={() => setShowQR(s => !s)}
              >
                {showQR ? "Hide QR code" : "Show QR code"}
              </Button>
            </Group>
            {showQR && (qr
              ? <img src={qr.src} width={qr.width} alt="QR code of the link" className="shareQR" />
              : <Text size="sm" c="dimmed">This link is too long to fit in a QR code.</Text>)}
          </Stack>
          <Stack gap="xs">
            <Title order={4}>Link to a file online</Title>
            <Text size="sm">
              A link can also open the animation file from somewhere online, such as a GitHub gist. The file keeps
              the images and videos you added, and a link to a gist opens its latest version, so you can edit the gist
              without changing the link. Export the animation file, put it online, and paste its address here
              to make the link.
              {" "}<a href={docsSiteHref(DOC_SECTIONS.sharingFile)} target="_blank" rel="noreferrer">Sharing</a> in the docs has
              the steps for a gist.
            </Text>
            <Group>
              <Button variant="default" leftSection={<TbDownload />} onClick={onDownload}>
                Export animation file
              </Button>
            </Group>
            <TextInput
              value={fileAddress} onChange={event => setFileAddress(event.currentTarget.value)}
              label="Address of the gist or file" placeholder="https://gist.github.com/…"
              error={fileLink && "error" in fileLink ? fileLink.error : undefined}
            />
            {fileLink && "link" in fileLink &&
              <TextInput
                readOnly value={fileLink.link} aria-label="Link to the file" rightSection={<Copy value={fileLink.link} />}
                onFocus={event => event.currentTarget.select()}
              />}
          </Stack>
          <Stack gap="xs">
            <Title order={4}>On a website</Title>
            <Text size="sm">
              Paste this code into a web page to show the animation playing there, with a link that opens it
              in smoothstep.
            </Text>
            <Textarea
              readOnly value={shared.embed} aria-label="Code for a web page" autosize minRows={2}
              rightSection={<Copy value={shared.embed} />} onFocus={event => event.currentTarget.select()}
            />
            <Text size="sm">
              Or download a player file. It's one web page that plays the animation, with its images and videos inside, and
              it works offline or on any website.
            </Text>
            <Group>
              <Button
                variant="default" leftSection={<TbDownload />} loading={making} onClick={() => void downloadPlayer()}
              >
                Download player file
              </Button>
            </Group>
          </Stack>
        </Stack>}
    </AppModal>
  );
}
