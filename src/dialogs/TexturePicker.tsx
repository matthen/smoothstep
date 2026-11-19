import { ActionIcon, Alert, Button, Group, Loader, Modal, Tabs, Text } from '@mantine/core';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { TbTrash, TbUpload } from 'react-icons/tb';

import { usePhone } from '../app/usePhone';
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
      <TbUpload className="uploadIcon" />
      <p>Drop image here, or click to select.</p>
      <div className="selectedFile">
        {selected && selectedFile &&
          <>
            <img src={selected.preview} alt={selectedFile.name} />  {selectedFile.name}
            <Button onClick={handleUpload} disabled={uploading}>Upload</Button>
            {uploading && <Loader size="xs" role="status" />}
          </>
        }
        {isRejected && <Alert color="red">File must be a single image.</Alert>}
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
  const phone = usePhone();

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
  const pickerItem = (key: string, selected: boolean, onClick: () => void, image: ReactNode, label?: string) =>
    <div className={"picker" + (selected ? " selected" : "")} key={key}>
      <button type="button" onClick={onClick} className="select">
        {image}
        {label && <span className="resolution">{label}</span>}
      </button>
    </div>;

  return (
    <>
      <Modal
        opened={show} onClose={onHide} returnFocus={false} size="xl" fullScreen={phone} title={texture.id || "iTexture" + slot}
        classNames={{content: "texturePickerModal"}}
      >
        <Tabs
          value={activeKey} onChange={key => key && setActiveKey(key)} orientation="vertical"
          variant="pills" className="texturePickerTabs" keepMounted={false}
        >
          <Tabs.List>
            {CATEGORIES.map(key =>
              <Tabs.Tab key={key} value={key} data-has-selection={key === selectedKey || undefined}>{key}</Tabs.Tab>,
            )}
            <Tabs.Tab value="uploads" data-has-selection={selectedKey === "uploads" || undefined}>user uploads</Tabs.Tab>
          </Tabs.List>
          {CATEGORIES.map(key =>
            <Tabs.Panel key={key} value={key}>
              <div className="texturePickerGrid">
                {TEXTURES[key]!.map(t => pickerItem(
                  t.fname, t.fname === texture.url, () => select(t.fname, false),
                  <img src={asset("/images/textures/" + t.thumbnail_fname)} alt={t.fname + " preview"} />,
                  `${t.width} × ${t.height}`,
                ))}
              </div>
            </Tabs.Panel>,
          )}
          <Tabs.Panel value="uploads">
            <div className="texturePickerGrid">
              {pickerItem(
                "upload", false, () => {setUploadFormKey(k => k + 1); setActiveKey("upload");},
                <TbUpload className="thumbnail" />, "upload new image",
              )}
              {otherUploads.map(t => pickerItem(
                "other-" + t.url, t.url === texture.url, () => select(t.url, true),
                <img src={uploadThumbURL(t.url)} alt="texture preview" />,
              ))}
              {uploads.map(image =>
                <div className={"picker" + (image.id === texture.url ? " selected" : "")} key={image.id}>
                  <button type="button" onClick={() => select(image.id, true)} className="select">
                    <img src={uploadThumbURL(image.id)} alt={image.filename + " preview"} />
                    <span className="resolution">{image.width} &times; {image.height}</span>
                  </button>
                  {image.id !== texture.url &&
                    <ActionIcon
                      size="sm" color="red" className="delete" title="Delete" aria-label="Delete"
                      onClick={() => {setToDelete(image); setShowConfirm(true);}}
                    ><TbTrash /></ActionIcon>
                  }
                </div>,
              )}
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="upload">
            <UploadForm
              key={uploadFormKey} onMessage={onMessage}
              onUploaded={() => setActiveKey("uploads")}
            />
          </Tabs.Panel>
        </Tabs>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onHide}>Cancel</Button>
          <Button onClick={() => onPick(texture)}>Apply changes</Button>
        </Group>
      </Modal>
      <Modal
        opened={showConfirm && toDelete !== null} onClose={() => setShowConfirm(false)} title="Delete image" size="sm"
        closeOnClickOutside={false}
      >
        {toDelete &&
          <>
            <Text mb="sm">Delete '<b>{toDelete.filename}</b>'?</Text>
            <img
              src={uploadThumbURL(toDelete.id)} alt={toDelete.filename + " preview"}
              style={{maxHeight: 128, maxWidth: 128}}
            />
          </>}
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button color="red" onClick={() => toDelete && handleDelete(toDelete)}>Delete</Button>
        </Group>
      </Modal>
    </>
  );
}
