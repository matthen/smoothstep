import { ActionIcon, Alert, Button, Group, Loader, Text } from '@mantine/core';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { TbArrowLeft, TbPhotoPlus, TbTrash } from 'react-icons/tb';

import AppModal from '../app/AppModal';
import { usePhone } from '../app/usePhone';
import { asset, textureURL } from '../lib/config';
import { EMPTY_TEXTURE, type TextureSlot } from '../lib/document';
import {
  addUploadedImage, deleteImage, listImages, MAX_IMAGE_DIM, MAX_VIDEO_MB, StorageFullError, UploadError,
  type StoredImage,
} from '../lib/localStore';
import { formatDuration, isVideoType, isVideoURL } from '../lib/media';
import TextureData from './textures.json';
import TextureThumbnail, { VideoLength } from './TextureThumbnail';
import { useImagesChanged } from './useImagesChanged';

interface BuiltInTexture {
  fname: string;
  thumbnail_fname: string;
  width: number;
  height: number;
  duration?: number;  // A video's length in seconds
}

const TEXTURES: Record<string, BuiltInTexture[]> = TextureData;

// The built-in textures' folders, in the order the picker lists them.
const GROUPS: {key: string; title: string; caption: string}[] = [
  {key: "photos", title: "Photos", caption: "Photographs, and a painting."},
  {key: "videos", title: "Videos", caption: "Short clips of the Moon, the sea, birds, sky and an old film, that play along with your animation."},
  {key: "special", title: "Noise", caption: "Random values to read in your code: noise, smooth noise, clouds and plasma."},
  {key: "tiling", title: "Tiling surfaces", caption: "Stone, sand and rust that repeat without seams."},
  {
    key: "equirectangular", title: "Panoramas",
    caption: "360° views in equirectangular form, for the sky and reflections in 3D scenes.",
  },
  {key: "fonts", title: "Font sheets", caption: "Text characters in a grid, for drawing text."},
];

const CAPTIONS: Record<string, string> = {
  "photos/30573139680_ab8dd0e4c3_c.jpg": "Nebula",
  "photos/36764351583_180cd1de97_c.jpg": "Forest",
  "photos/50866961661_873602eafb_c.jpg": "Galaxy",
  "photos/9155009434_9ef1f8deb8_z.jpg": "Leaves",
  "photos/cats1.jpg": "Cats",
  "photos/cats2.jpg": "Cat",
  "photos/jorg-angeli-S56zN8cV5fk-unsplash.jpg": "Castle",
  "photos/nickypainting.jpg": "Painting",
  "photos/tiles.jpg": "Tiles",
  "videos/arthursseat.mp4": "Clouds over Arthur's Seat",
  "videos/moon.mp4": "Apollo 16: driving on the Moon",
  "videos/starlings.mp4": "Starlings at dusk",
  "videos/train.mp4": "Lumière: arrival of a train",
  "videos/waves.mp4": "Waves on a rock at sunset",
  "special/clouds.png": "Clouds",
  "special/noise.png": "Noise",
  "special/noise_gauss.png": "Smooth noise",
  "special/noise_gauss_large.png": "Smooth noise, large",
  "special/noise_large.png": "Noise, large",
  "special/plasma.png": "Plasma",
  "equirectangular/27450338940_708196e177_k.jpg": "Pine forest",
  "equirectangular/49973646676_79dbc1a189_k.jpg": "Avenue of trees",
  "equirectangular/world.png": "World map",
  "fonts/1.png": "Courier Prime",
  "fonts/2.png": "Arimo",
  "fonts/3.png": "Tinos",
  "fonts/4.png": "Inter",
  "fonts/5.png": "Exo 2",
  "fonts/6.png": "Exo 2 Bold",
};

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

// A texture's size, shown on hover. A video whose length shows in its badge needn't say it's a video.
function sizeLabel(width: number, height: number, video: boolean, duration?: number): string {
  return `${width} × ${height}${video && !formatDuration(duration) ? ", video" : ""}`;
}

function uploadThumbURL(id: string): string {
  return textureURL({isUserUploaded: true, url: id});
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
    accept: {"image/*": [], "video/*": []},
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
    const what = isVideoType(selectedFile.type) ? "video" : "image";
    try {
      await addUploadedImage(selectedFile);
      onMessage(what === "video" ? "Video added." : "Image added.");
      onUploaded();
    } catch (error) {
      console.log(error);
      onMessage(error instanceof StorageFullError || error instanceof UploadError ? error.message : `Couldn't add the ${what}.`);
      setUploading(false);
    }
  };

  return (
    <div {...getRootProps()} className={"dropzone" + (isDragActive ? " active" : "")}>
      <input {...getInputProps()} />
      <TbPhotoPlus className="uploadIcon" />
      <p>Drop an image or video here, or click to choose one. It stays in this browser.</p>
      <div className="selectedFile">
        {selected && selectedFile &&
          <>
            <TextureThumbnail src={selected.preview} alt={selectedFile.name} video={isVideoType(selectedFile.type)} />
            {selectedFile.name}
            <Button onClick={event => void handleUpload(event)} disabled={uploading}>Add</Button>
            {uploading && <Loader size="xs" role="status" />}
          </>
        }
        {isRejected && <Alert color="red">File must be a single image or video.</Alert>}
      </div>
      <p className="uploadNote">Images larger than {MAX_IMAGE_DIM}&nbsp;px are scaled down.</p>
      <p className="uploadNote">
        Videos can be up to {MAX_VIDEO_MB}&nbsp;MB and {MAX_IMAGE_DIM}&nbsp;px. A video plays along with the animation, and
        starts again from the beginning when it ends.
      </p>
    </div>
  );
}

export default function TexturePicker(
  {show, slot, current, textures = [], onPick, onHide, onMessage = () => {}}: TexturePickerProps,
) {
  const [texture, setTexture] = useState(current);
  // Bumped to remount (and so reset) the upload form each time it's opened.
  const [uploadFormKey, setUploadFormKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [uploads, setUploads] = useState<StoredImage[]>([]);
  const [toDelete, setToDelete] = useState<StoredImage | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [wasShown, setWasShown] = useState(false);
  // Lengths of uploaded videos stored without one, read from their thumbnails.
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const imagesVersion = useImagesChanged();
  const phone = usePhone();

  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setTexture(current);
      setShowUpload(false);
    }
  }

  useEffect(() => {
    if (show) {
      listImages().then(setUploads).catch((error: unknown) => {
        console.log(error);
        onMessage("Error listing your images and videos.");
      });
    }
  }, [show, imagesVersion]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Opens on the slot's current image.
  useEffect(() => {
    if (!show) {
      return;
    }
    const timer = window.setTimeout(() =>
      bodyRef.current?.querySelector(".picker.selected")?.scrollIntoView({block: "center"}), 50);
    return () => window.clearTimeout(timer);
  }, [show]);

  // Uploads in this animation that aren't in this browser (e.g. from a file opened without its images).
  const uploadIds = new Set(uploads.map(image => image.id));
  const otherUploads = textures.filter(t => t.isUserUploaded && !uploadIds.has(t.url));

  const select = (url: string, isUserUploaded: boolean) => setTexture({...texture, url, isUserUploaded});

  const handleDelete = async (image: StoredImage) => {
    setShowConfirm(false);
    const what = isVideoType(image.blob.type) ? "video" : "image";
    try {
      await deleteImage(image.id);
      onMessage(what === "video" ? "Video deleted." : "Image deleted.");
    } catch (error) {
      console.log(error);
      onMessage(`Error deleting ${what}.`);
    }
  };

  const pickerItem = (
    key: string, selected: boolean, onClick: () => void, image: ReactNode, caption?: string, size?: string, length?: string | null,
  ) =>
    <figure className={"picker" + (selected ? " selected" : "")} key={key}>
      <button type="button" onClick={onClick} className="select" title={caption}>
        {image}
        {size && <span className="resolution">{size}</span>}
        <VideoLength text={length} />
      </button>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>;

  const section = (key: string, title: string, caption: string, items: ReactNode) =>
    <section className="texturePickerSection" key={key} aria-label={title}>
      <h3>{title}</h3>
      <p>{caption}</p>
      <div className="texturePickerGrid">{items}</div>
    </section>;

  return (
    <>
      <AppModal
        opened={show} onClose={onHide} returnFocus={false} size="xl" fullScreen={phone} title={texture.id || "iTexture" + slot}
        classNames={{content: "texturePickerModal"}}
      >
        {showUpload
          ? <>
            <Button variant="subtle" color="gray" leftSection={<TbArrowLeft />} mb="sm" onClick={() => setShowUpload(false)}>
              Back to the textures
            </Button>
            <UploadForm key={uploadFormKey} onMessage={onMessage} onUploaded={() => setShowUpload(false)} />
          </>
          : <div className="texturePickerBody" ref={bodyRef}>
            {section("uploads", "Your images and videos", "Images and videos you've added. They stay in this browser and aren't sent anywhere.", <>
              {pickerItem(
                "upload", false, () => {setUploadFormKey(k => k + 1); setShowUpload(true);},
                <TbPhotoPlus className="thumbnail" />, "Add image or video",
              )}
              {otherUploads.map(t => pickerItem(
                "other-" + t.url, t.url === texture.url, () => select(t.url, true),
                <TextureThumbnail src={uploadThumbURL(t.url)} alt="texture preview" />,
              ))}
              {uploads.map(image =>
                <figure className={"picker" + (image.id === texture.url ? " selected" : "")} key={image.id}>
                  <button type="button" onClick={() => select(image.id, true)} className="select" title={image.filename}>
                    <TextureThumbnail
                      src={uploadThumbURL(image.id)} alt={image.filename + " preview"} video={isVideoType(image.blob.type)}
                      onDuration={image.duration === undefined
                        ? seconds => setMeasured(m => m[image.id] === seconds ? m : {...m, [image.id]: seconds})
                        : undefined}
                    />
                    <span className="resolution">
                      {sizeLabel(image.width, image.height, isVideoType(image.blob.type), image.duration ?? measured[image.id])}
                    </span>
                    {isVideoType(image.blob.type) && <VideoLength text={formatDuration(image.duration ?? measured[image.id])} />}
                  </button>
                  <figcaption>{image.filename}</figcaption>
                  {image.id !== texture.url &&
                    <ActionIcon
                      size="sm" color="red" className="delete" title="Delete" aria-label="Delete"
                      onClick={() => {setToDelete(image); setShowConfirm(true);}}
                    ><TbTrash /></ActionIcon>
                  }
                </figure>,
              )}
            </>)}
            {GROUPS.map(({key, title, caption}) => section(key, title, caption,
              TEXTURES[key]!.filter(t => t.fname !== EMPTY_TEXTURE).map(t => pickerItem(
                t.fname, t.fname === texture.url, () => select(t.fname, false),
                <img src={asset("/images/textures/" + t.thumbnail_fname)} alt={t.fname + " preview"} loading="lazy" />,
                CAPTIONS[t.fname], sizeLabel(t.width, t.height, isVideoURL(t.fname), t.duration),
                isVideoURL(t.fname) ? formatDuration(t.duration) : null,
              )),
            ))}
          </div>}
        <Group justify="space-between" mt="lg" wrap="nowrap" gap="xs">
          <Button
            variant="subtle" color="gray" size={phone ? "compact-sm" : "sm"} disabled={texture.url === EMPTY_TEXTURE && !texture.isUserUploaded}
            onClick={() => setTexture({...texture, url: EMPTY_TEXTURE, isUserUploaded: false})}
          >
            Empty the slot
          </Button>
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" size={phone ? "compact-sm" : "sm"} onClick={onHide}>Cancel</Button>
            <Button size={phone ? "compact-sm" : "sm"} onClick={() => onPick(texture)}>Apply changes</Button>
          </Group>
        </Group>
      </AppModal>
      <AppModal
        opened={showConfirm && toDelete !== null} onClose={() => setShowConfirm(false)}
        title={toDelete && isVideoType(toDelete.blob.type) ? "Delete video" : "Delete image"} size="sm"
        closeOnClickOutside={false}
      >
        {toDelete &&
          <>
            <Text mb="sm">Delete '<b>{toDelete.filename}</b>'?</Text>
            <TextureThumbnail
              src={uploadThumbURL(toDelete.id)} alt={toDelete.filename + " preview"} video={isVideoType(toDelete.blob.type)}
              style={{maxHeight: 128, maxWidth: 128}}
            />
          </>}
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setShowConfirm(false)}>Cancel</Button>
          <Button color="red" onClick={() => toDelete && void handleDelete(toDelete)}>Delete</Button>
        </Group>
      </AppModal>
    </>
  );
}
