import React from 'react';
import { FaDownload, FaFileImport, FaFolderOpen, FaTrash } from "react-icons/fa";
import { Alert, Button, Modal, Table } from 'react-bootstrap';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

import * as archive from '../archive';
import { documentHref } from '../config';
import * as localStore from '../localStore';
import ImageWithFallback from './ImageWithFallback';

TimeAgo.addLocale(en);

class DocumentBrowser extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      documents: [],
      showConfirm: false,
      toDelete: null,
      busy: false,
    };
    this.timeAgo = new TimeAgo('en-US');
    this.fileInput = React.createRef();
  }

  onShow() {
    this.updateList();
  }

  handleDownload(document) {
    localStore.getDocument(document.id).then(archive.animationFile).then(
      ({blob, filename}) => archive.download(blob, filename)
    ).catch(error => {
      console.log(error);
      this.props.showAlert("Error downloading animation.");
    });
  }

  handleDownloadAll() {
    this.setState({busy: true});
    archive.exportAll().then(
      ({blob, filename}) => archive.download(blob, filename)
    ).catch(error => {
      console.log(error);
      this.props.showAlert("Error downloading animations.");
    }).finally(() => this.setState({busy: false}));
  }

  handleImport(files) {
    if (!files || files.length === 0) {
      return;
    }
    this.setState({busy: true});
    archive.importFiles(files).then(summary => {
      this.updateList();
      this.props.showAlert(importMessage(summary));
    }).catch(error => {
      console.log(error);
      this.props.showAlert("Error opening file.");
    }).finally(() => {
      this.setState({busy: false});
      if (this.fileInput.current) {
        this.fileInput.current.value = "";
      }
    });
  }

  updateList() {
    localStore.listDocuments().then(
      documents => this.setState({documents})
    ).catch(
      error => {
        console.log(error);
        this.props.showAlert("Error finding animations.");
      }
    );
  }

  handleDelete(document) {
    this.setState({showConfirm: false});
    const isThisDocument = (document.id === this.props.documentId);
    localStore.deleteDocument(document.id).then(
      () => {
        this.updateList();
        this.props.showAlert("Animation deleted.");
        if (isThisDocument) {
          this.props.onDeletedOpenDocument();
        }
      }
    ).catch(
      error => {
        console.log(error);
        this.props.showAlert("Error deleting animation.");
      }
    );
  }

  render() {
    return (
      <>
        <Modal
          show={this.props.show}
          onHide={() => this.props.onHide()}
          onShow={() => this.onShow()}
          dialogClassName="documentBrowser"
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>
              <FaFolderOpen /> Open
            </Modal.Title>
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
                  {this.state.documents.map(
                    (document) => (
                      <tr key={document.id} className={document.id === this.props.documentId ? "opened" : ""}>
                        <td className="centerTD">
                          {document.thumbnail &&
                            <a href={documentHref(document.id)}>
                              <ImageWithFallback
                                src={document.thumbnail}
                                height="64px"
                                alt="thumbnail"
                              />
                            </a>
                          }
                        </td>
                        <td><a href={documentHref(document.id)}>{document.title}</a></td>
                        <td>{this.timeAgo.format(document.modified)}</td>
                        <td>{this.timeAgo.format(document.created)}</td>
                        <td className="buttonsTD">
                          <Button
                            size="sm" variant="light" title="Download"
                            onClick={() => this.handleDownload(document)}
                          ><FaDownload /></Button>
                          <Button
                            size="sm" variant="light" title="Delete"
                            onClick={() => this.setState({
                              toDelete: document,
                              showConfirm: true,
                            })}
                          ><FaTrash /></Button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </Table>
              {this.state.documents.length === 0 && (
                <Alert variant="warning">
                  You have no saved animations.
                </Alert>
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
              ref={this.fileInput} style={{display: "none"}}
              onChange={(event) => this.handleImport(event.target.files)}
            />
            <Button
              variant="secondary" className="mr-auto" disabled={this.state.busy}
              onClick={() => this.fileInput.current.click()}
            ><FaFileImport /> Open file…</Button>
            <Button
              variant="secondary"
              disabled={this.state.busy || this.state.documents.length === 0}
              onClick={() => this.handleDownloadAll()}
            ><FaDownload /> Download all</Button>
            <Button
              variant="secondary"
              onClick={() => this.props.onHide()}
            >Cancel</Button>
          </Modal.Footer>
        </Modal>
        {this.state.toDelete &&
          <Modal
            show={this.state.showConfirm}
            onHide={() => this.setState({showConfirm: false})}
            centered
            backdrop="static"
          >
            <Modal.Header closeButton>
            </Modal.Header>
            <Modal.Body>
              <p>Delete '<b>{this.state.toDelete.title}</b>'?</p>
              {this.state.toDelete.id === this.props.documentId &&
                <Alert variant="warning">That is the currently open animation.</Alert>
              }
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => this.setState({showConfirm: false})}
              >Cancel</Button>
              <Button
                onClick={() => this.handleDelete(this.state.toDelete)}
                variant="danger"
              >Delete</Button>
            </Modal.Footer>
          </Modal>
        }
      </>
    );
  }
}

function importMessage({animations, images, unchanged, failed}) {
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  let parts = [];
  if (animations || images || !(unchanged || failed)) {
    parts.push(plural(animations, "animation") + " and " + plural(images, "image") + " added.");
  }
  if (unchanged) {
    parts.push(plural(unchanged, "animation") + " already here.");
  }
  if (failed) {
    parts.push(plural(failed, "item") + " couldn't be read.");
  }
  return parts.join(" ");
}

export default DocumentBrowser;
