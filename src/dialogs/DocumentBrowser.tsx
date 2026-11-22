import { ActionIcon, Alert, Button, Group, ScrollArea, Table, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { TbDownload, TbFileImport, TbTrash } from 'react-icons/tb';

import AppModal from '../app/AppModal';
import { usePhone } from '../app/usePhone';
import { animationFile, download, exportAll } from '../lib/archive';
import { documentHref } from '../lib/config';
import { deleteDocument, getDocument, listDocuments, StorageFullError, type DocumentSummary } from '../lib/localStore';
import ExampleGallery from './ExampleGallery';
import ImageWithFallback from './ImageWithFallback';
import { timeAgo } from './timeAgo';

interface DocumentBrowserProps {
  show: boolean;
  onHide(): void;
  currentId: string | null;
  onDeleted(id: string): void;
  onMessage(text: string): void;
  // Asks for animation files from the computer.
  onOpenFile(): void;
  // Changes when animations are added from elsewhere, so the list updates.
  version: number;
}

function errorText(error: unknown, fallback: string): string {
  console.log(error);
  return error instanceof StorageFullError ? error.message : fallback;
}

export default function DocumentBrowser({show, onHide, currentId, onDeleted, onMessage, onOpenFile, version}: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [toDelete, setToDelete] = useState<DocumentSummary | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const phone = usePhone();

  const updateList = () => {
    listDocuments().then(setDocuments).catch((error: unknown) => onMessage(errorText(error, "Error finding animations.")));
  };

  useEffect(() => {
    if (show) {
      updateList();
    }
  }, [show, version]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async (document: DocumentSummary) => {
    try {
      const record = await getDocument(document.id);
      if (!record) {
        throw new Error("Animation not found: " + document.id);
      }
      download(await animationFile(record));
    } catch (error) {
      onMessage(errorText(error, "Error downloading animation."));
    }
  };

  const handleDownloadAll = async () => {
    setBusy(true);
    try {
      download(await exportAll());
    } catch (error) {
      onMessage(errorText(error, "Error downloading animations."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (document: DocumentSummary) => {
    setShowConfirm(false);
    try {
      await deleteDocument(document.id);
      updateList();
      onMessage("Animation deleted.");
      if (document.id === currentId) {
        onDeleted(document.id);
      }
    } catch (error) {
      onMessage(errorText(error, "Error deleting animation."));
    }
  };

  return (
    <>
      <AppModal
        opened={show} onClose={onHide} title="Open" size={800} fullScreen={phone} classNames={{content: "documentBrowser"}}>
        <Title order={2} size="h5" mb="xs">Your animations</Title>
        {documents.length > 0 &&
          <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
            <Table striped highlightOnHover verticalSpacing={4} stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={80}></Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th visibleFrom="sm">Modified</Table.Th>
                  <Table.Th visibleFrom="sm">Created</Table.Th>
                  <Table.Th w={80}></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {documents.map(document => (
                  <Table.Tr key={document.id} className={document.id === currentId ? "opened" : ""}>
                    <Table.Td>
                      {document.thumbnail &&
                        <a href={documentHref(document.id)} onClick={onHide}>
                          <ImageWithFallback src={document.thumbnail} height="48" className="thumbnail" alt="thumbnail" />
                        </a>
                      }
                    </Table.Td>
                    <Table.Td><a href={documentHref(document.id)} onClick={onHide}>{document.title}</a></Table.Td>
                    <Table.Td visibleFrom="sm">{timeAgo(document.modified)}</Table.Td>
                    <Table.Td visibleFrom="sm">{timeAgo(document.created)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon variant="subtle" color="gray" title="Download file" aria-label="Download file" onClick={() => void handleDownload(document)}>
                          <TbDownload />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle" color="gray" title="Delete" aria-label="Delete"
                          onClick={() => {setToDelete(document); setShowConfirm(true);}}
                        ><TbTrash /></ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>}
        {documents.length === 0 &&
          <Text c="dimmed" size="sm">
            You have no saved animations yet. File → Save keeps the one you're working on here, and
            "Open file…" below opens one you downloaded.
          </Text>}
        <Text c="dimmed" size="sm" mt="sm">
          Animations are saved in this browser only. Download them to keep a backup
          or to move them to another computer.
        </Text>
        <Title order={2} size="h5" mt="lg" mb="xs">Examples</Title>
        <ExampleGallery onOpen={onHide} />
        <Group gap="xs" className="modalActions">
          <Button variant="default" leftSection={<TbFileImport />} onClick={onOpenFile}>
            Open file…
          </Button>
          <Button
            variant="default" leftSection={<TbDownload />} ml="auto"
            disabled={busy || documents.length === 0} onClick={() => void handleDownloadAll()}
          >
            Download all files
          </Button>
        </Group>
      </AppModal>
      <AppModal opened={showConfirm && toDelete !== null} onClose={() => setShowConfirm(false)} title="Delete animation" size="sm"
        closeOnClickOutside={false}
      >
        {toDelete &&
          <>
            <Text>Delete '<b>{toDelete.title}</b>'?</Text>
            {toDelete.id === currentId &&
              <Alert color="yellow" mt="sm">That is the currently open animation.</Alert>}
          </>}
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button color="red" onClick={() => toDelete && void handleDelete(toDelete)}>Delete</Button>
        </Group>
      </AppModal>
    </>
  );
}
