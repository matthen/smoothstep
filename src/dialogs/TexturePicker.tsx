import { useEffect, useState, type MouseEvent } from 'react';
import { Alert, Button, Col, Modal, Nav, Row, Spinner, Tab } from 'react-bootstrap';
import { useDropzone } from 'react-dropzone';
import { FaFileUpload, FaTrash } from 'react-icons/fa';

import { asset, textureURL } from '../lib/config';
import type { TextureSlot } from '../lib/document';
import {
  addUploadedImage, deleteImage, listImages, MAX_IMAGE_DIM, StorageFullError, type StoredImage,
} from '../lib/localStore';
import TextureData from './textures.json';
import { useImagesChanged } from './useImagesChanged';

interface BuiltInTexture {
  fname: string;
  thumbnail_fname: string;
  width: number;
  height: number;
}

const TEXTURES: Record<string, BuiltInTexture[]> = TextureData;
const CATEGORIES = Object.keys(TEXTURES);

interface TexturePickerProps {
  show: boolean;
  slot: number;
  current: TextureSlot;
  // The animation's texture slots, so uploads this browser doesn't have can still be picked.
  textures?: TextureSlot[];
  onPick(texture: TextureSlot): void;
  onHide(): void;
  onMessage?(text: string): void;
}

function uploadThumbURL(id: string): string {
  return textureURL({isUserUploaded: true, url: id});
}

function categoryOf(texture: TextureSlot): string {
  return texture.isUserUploaded ? "uploads" : (texture.url.split("/")[0] ?? "");
}

function UploadForm({onUploaded, onMessage}: {onUploaded(): void; onMessage(text: string): void}) {
  const [selected, setSelected] = useState<{file: File; preview: string} | null>(null);
  const [isRejected, setIsRejected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const selectedFile = selected?.file;

  useEffect(() => {
    const preview = selected?.preview;
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [selected]);

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    accept: {"image/*": []},
    maxFiles: 1,
    onDrop: (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      setSelected(file ? {file, preview: URL.createObjectURL(file)} : null);
      setIsRejected(!file);
    },
  });

  const handleUpload = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!selectedFile) {
      return;
    }
    setUploading(true);
    try {
      await addUploadedImage(selectedFile);
      onMessage("Image uploaded.");
      onUploaded();
    } catch (error) {
      console.log(error);
      onMessage(error instanceof StorageFullError ? error.message : "Unable to upload image.");
      setUploading(false);
    }
  };

  return (
    <div {...getRootProps()} className={"dropzone" + (isDragActive ? " active" : "")}>
      <input {...getInputProps()} />
      <FaFileUpload className="uploadIcon" />
      <p>Drop image here, or click to select.</p>
      <div className="selectedFile">
        {selected && selectedFile &&
          <>
            <img src={selected.preview} alt={selectedFile.name} />  {selectedFile.name}
            <Button onClick={handleUpload} disabled={uploading}>Upload</Button>
            {uploading && <Spinner animation="border" role="status" variant="light" size="sm" />}
          </>
        }
        {isRejected && <Alert variant="danger">File must be a single image.</Alert>}
      </div>
      <p className="uploadNote">Images larger than {MAX_IMAGE_DIM}&nbsp;px are scaled down.</p>
    </div>
  );
}

export default function TexturePicker(
  {show, slot, current, textures = [], onPick, onHide, onMessage = () => {}}: TexturePickerProps,
) {
  const [texture, setTexture] = useState(current);
  const [activeKey, setActiveKey] = useState(categoryOf(current));
  // Bumped to remount (and so reset) the upload form each time it's opened.
  const [uploadFormKey, setUploadFormKey] = useState(0);
  const [uploads, setUploads] = useState<StoredImage[]>([]);
  const [toDelete, setToDelete] = useState<StoredImage | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [wasShown, setWasShown] = useState(false);
  const imagesVersion = useImagesChanged();

  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setTexture(current);
      setActiveKey(categoryOf(current));
    }
  }

  useEffect(() => {
    if (show) {
      listImages().then(setUploads).catch(error => {
        console.log(error);
        onMessage("Error listing your images.");
      });
    }
  }, [show, imagesVersion]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Uploads in this animation that aren't in this browser (e.g. from a file opened without its images).
  const uploadIds = new Set(uploads.map(image => image.id));
  const otherUploads = textures.filter(t => t.isUserUploaded && !uploadIds.has(t.url));

  const select = (url: string, isUserUploaded: boolean) => setTexture({...texture, url, isUserUploaded});

  const handleDelete = async (image: StoredImage) => {
    setShowConfirm(false);
    try {
      await deleteImage(image.id);
      onMessage("Image deleted.");
    } catch (error) {
      console.log(error);
      onMessage("Error deleting image.");
    }
  };

  const selectedKey = categoryOf(texture);
  return (
    <>
      <Modal
        show={show} onHide={onHide} restoreFocus={false}
        size="lg" dialogClassName="texturePickerModal" centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{texture.id || "iTexture" + slot}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Tab.Container activeKey={activeKey} onSelect={key => key && setActiveKey(key)}>
            <Row>
              <Col sm={3}>
                <Nav variant="pills" className="flex-column">
                  {CATEGORIES.map(key =>
                    <Nav.Item key={key} className={key === selectedKey ? "selected" : undefined}>
                      <Nav.Link eventKey={key}>{key}</Nav.Link>
                    </Nav.Item>,
                  )}
                  <Nav.Item className={selectedKey === "uploads" ? "selected" : undefined}>
                    <Nav.Link eventKey="uploads">user uploads</Nav.Link>
                  </Nav.Item>
                </Nav>
              </Col>
              <Col sm={9}>
                <Tab.Content>
                  {CATEGORIES.map(key =>
                    <Tab.Pane key={key} eventKey={key}>
                      <div className="texturePickerGrid">
                        {TEXTURES[key]!.map(t =>
                          <div className={"picker" + (t.fname === texture.url ? " selected" : "")} key={t.fname}>
                            <button onClick={() => select(t.fname, false)} className="select">
                              <img src={asset("/images/textures/" + t.thumbnail_fname)} alt={t.fname + " preview"} />
                              <span className="resolution">{t.width} &times; {t.height}</span>
                            </button>
                          </div>,
                        )}
                      </div>
                    </Tab.Pane>,
                  )}
                  <Tab.Pane eventKey="uploads">
                    <div className="texturePickerGrid">
                      <div className="picker">
                        <button
                          onClick={() => {setUploadFormKey(k => k + 1); setActiveKey("upload");}}
                          className="select"
                        >
                          <FaFileUpload className="thumbnail" />
                          <span className="resolution">upload new image</span>
                        </button>
                      </div>
                      {otherUploads.map(t =>
                        <div className={"picker" + (t.url === texture.url ? " selected" : "")} key={"other-" + t.url}>
                          <button onClick={() => select(t.url, true)} className="select">
                            <img src={uploadThumbURL(t.url)} alt="texture preview" />
                          </button>
                        </div>,
                      )}
                      {uploads.map(image =>
                        <div className={"picker" + (image.id === texture.url ? " selected" : "")} key={image.id}>
                          <button onClick={() => select(image.id, true)} className="select">
                            <img src={uploadThumbURL(image.id)} alt={image.filename + " preview"} />
                            <span className="resolution">{image.width} &times; {image.height}</span>
                          </button>
                          {image.id !== texture.url &&
                            <Button
                              size="sm" className="delete" title="Delete"
                              onClick={() => {setToDelete(image); setShowConfirm(true);}}
                            ><FaTrash /></Button>
                          }
                        </div>,
                      )}
                    </div>
                  </Tab.Pane>
                  <Tab.Pane eventKey="upload">
                    <UploadForm
                      key={uploadFormKey} onMessage={onMessage}
                      onUploaded={() => setActiveKey("uploads")}
                    />
                  </Tab.Pane>
                </Tab.Content>
              </Col>
            </Row>
          </Tab.Container>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button variant="primary" onClick={() => onPick(texture)}>Apply changes</Button>
        </Modal.Footer>
      </Modal>
      {toDelete &&
        <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered backdrop="static">
          <Modal.Header closeButton></Modal.Header>
          <Modal.Body>
            <p>Delete '<b>{toDelete.filename}</b>'?</p>
            <img
              src={uploadThumbURL(toDelete.id)} alt={toDelete.filename + " preview"}
              style={{maxHeight: 128, maxWidth: 128}}
            />
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
