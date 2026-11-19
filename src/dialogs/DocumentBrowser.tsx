import { useRef, useState } from 'react';
import { Alert, Button, Modal, Table } from 'react-bootstrap';
import { FaDownload, FaFileImport, FaFolderOpen, FaTrash } from 'react-icons/fa';

import { animationFile, download, exportAll, importFiles, importMessage } from '../lib/archive';
import { documentHref } from '../lib/config';
import { deleteDocument, getDocument, listDocuments, StorageFullError, type DocumentSummary } from '../lib/localStore';
import ImageWithFallback from './ImageWithFallback';
import { timeAgo } from './timeAgo';

interface DocumentBrowserProps {
  show: boolean;
  onHide(): void;
  currentId: string | null;
  onDeleted(id: string): void;
  onMessage(text: string): void;
}

function errorText(error: unknown, fallback: string): string {
  console.log(error);
  return error instanceof StorageFullError ? error.message : fallback;
}

export default function DocumentBrowser({show, onHide, currentId, onDeleted, onMessage}: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [toDelete, setToDelete] = useState<DocumentSummary | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const updateList = () => {
    listDocuments().then(setDocuments).catch(error => onMessage(errorText(error, "Error finding animations.")));
  };

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

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const summary = await importFiles(Array.from(files));
      updateList();
      onMessage(importMessage(summary));
    } catch (error) {
      onMessage(errorText(error, "Error opening file."));
    } finally {
      setBusy(false);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
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
      <Modal show={show} onHide={onHide} onShow={updateList} dialogClassName="documentBrowser" centered>
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title><FaFolderOpen /> Open</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="tableFixedHead">
            <Table striped bordered size="sm">
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Modified</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map(document => (
                  <tr key={document.id} className={document.id === currentId ? "opened" : ""}>
                    <td className="centerTD">
                      {document.thumbnail &&
                        <a href={documentHref(document.id)} onClick={onHide}>
                          <ImageWithFallback src={document.thumbnail} height="64px" alt="thumbnail" />
                        </a>
                      }
                    </td>
                    <td><a href={documentHref(document.id)} onClick={onHide}>{document.title}</a></td>
                    <td>{timeAgo(document.modified)}</td>
                    <td>{timeAgo(document.created)}</td>
                    <td className="buttonsTD">
                      <Button size="sm" variant="light" title="Download" onClick={() => handleDownload(document)}>
                        <FaDownload />
                      </Button>
                      <Button
                        size="sm" variant="light" title="Delete"
                        onClick={() => {setToDelete(document); setShowConfirm(true);}}
                      ><FaTrash /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {documents.length === 0 && (
              <Alert variant="warning">You have no saved animations.</Alert>
            )}
          </div>
          <p className="storageNote">
            Animations are saved in this browser only. Download them to keep a backup
            or to move them to another computer.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <input
            type="file" accept=".json,.zip,application/json,application/zip" multiple
            ref={fileInput} style={{display: "none"}} data-testid="importInput"
            onChange={event => handleImport(event.target.files)}
          />
          <Button variant="secondary" className="me-auto" disabled={busy} onClick={() => fileInput.current?.click()}>
            <FaFileImport /> Open file…
          </Button>
          <Button variant="secondary" disabled={busy || documents.length === 0} onClick={handleDownloadAll}>
            <FaDownload /> Download all
          </Button>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
        </Modal.Footer>
      </Modal>
      {toDelete &&
        <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered backdrop="static">
          <Modal.Header closeButton closeVariant="white"></Modal.Header>
          <Modal.Body>
            <p>Delete '<b>{toDelete.title}</b>'?</p>
            {toDelete.id === currentId &&
              <Alert variant="warning">That is the currently open animation.</Alert>
            }
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(toDelete)}>Delete</Button>
          </Modal.Footer>
        </Modal>
      }
    </>
  );
}
