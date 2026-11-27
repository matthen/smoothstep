// The File and Help menus' dialogs, the hidden file input for imports, and the alert.
import { Button, Group } from '@mantine/core';
import { useCallback } from 'react';

import DocumentBrowser from '../dialogs/DocumentBrowser';
import ExportSettings from '../dialogs/ExportSettings';
import Import from '../dialogs/Import';
import SaveCopy from '../dialogs/SaveCopy';
import Share from '../dialogs/Share';
import Splash from '../dialogs/Splash';
import { routeHash } from '../lib/routes';
import AppModal from './AppModal';
import type { useDocument } from './document/useDocument';
import type { Preview, useExport } from '../export/useExport';
import type { useLibrary } from './document/useLibrary';

export type Dialog = "open" | "import" | "saveCopy" | "share" | "export" | "splash";

interface Props {
  dialog: Dialog | null;
  setDialog: (dialog: Dialog | null) => void;
  docState: ReturnType<typeof useDocument>;
  library: ReturnType<typeof useLibrary>;
  exporter: ReturnType<typeof useExport>;
  preview: Preview;
  onTour: () => void;
  tourTaken: boolean;
  alert: string | null;
  setAlert: (text: string | null) => void;
}

export default function AppDialogs(
  {dialog, setDialog, docState, library, exporter, preview, onTour, tourTaken, alert, setAlert}: Props,
) {
  const {doc, documentId, sharedFrom, hasUnsavedChanges, dispatch} = docState;
  const {fileInput, save, download} = library;
  const closeDialog = useCallback(() => setDialog(null), [setDialog]);
  return (
    <>
      <DocumentBrowser
        show={dialog === "open"} onHide={closeDialog} currentId={documentId}
        onDeleted={id => {
          if (id === documentId) {
            // Keep what's in the editor, as an unsaved new animation.
            window.history.replaceState({}, "", "#new");
            dispatch({type: "deleted"});
          }
        }}
        onMessage={setAlert}
        onImport={() => setDialog("import")}
        version={library.libraryVersion}
      />
      <input
        type="file" accept=".json,.zip,application/json,application/zip" multiple
        ref={fileInput} style={{display: "none"}} data-testid="importInput"
        onChange={event => void library.openFiles(event.target.files)}
      />
      <Import
        show={dialog === "import"} onHide={closeDialog}
        onChooseFiles={() => {setDialog(null); fileInput.current?.click();}}
        onImportLink={library.importLink}
      />
      <Share
        show={dialog === "share"} doc={doc} onHide={closeDialog} onMessage={setAlert}
        onDownload={() => void download()}
        source={sharedFrom && documentId === null && !hasUnsavedChanges ? routeHash(sharedFrom) : null}
      />
      <SaveCopy
        show={dialog === "saveCopy"} title={doc.title} onHide={closeDialog}
        onSave={title => {setDialog(null); void save(true, title);}}
      />
      <ExportSettings
        show={dialog === "export"} duration={doc.duration} aspectRatio={doc.aspectRatio}
        options={exporter.exportOptions} onOptionsChange={exporter.setExportOptions}
        onExport={() => void exporter.startExport(preview)} onCancel={exporter.cancelExport}
        progress={exporter.exportProgress} error={exporter.exportError}
      />
      <Splash show={dialog === "splash"} onHide={closeDialog} onTour={onTour} tourTaken={tourTaken} />
      <AppModal opened={alert !== null} onClose={() => setAlert(null)} withCloseButton={false} zIndex={400}>
        <p className="alertText">{alert}</p>
        <Group justify="flex-end"><Button onClick={() => setAlert(null)}>Ok</Button></Group>
      </AppModal>
    </>
  );
}
