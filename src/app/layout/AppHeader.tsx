// The header, with the title, the File and Help menus, and the buttons for saving, sharing and rendering.
import { ActionIcon, Badge, Button, Group, Kbd, Menu, Text, TextInput, Tooltip } from '@mantine/core';
import { useRef } from 'react';
import {
  TbBook, TbBrandGithub, TbChevronDown, TbCode, TbCopy, TbDeviceDesktopDown, TbDeviceFloppy, TbDownload, TbFile,
  TbFileImport, TbFolderOpen, TbHelp, TbHistory, TbHome, TbKeyboard, TbRoute, TbSchool, TbShare, TbVideo,
} from 'react-icons/tb';

import { asset, REPO_URL, TUTORIAL_HREF } from '../../lib/config';
import { DOC_SECTIONS, type DocTarget } from '../../lib/docLinks';
import { DEFAULT_TITLE, MAX_TITLE_LENGTH } from '../../lib/document';
import { install, useCanInstall } from '../../pwa/install';
import { MOD_KEY } from '../platform';

interface Props {
  phone: boolean;
  touch: boolean;
  titleInput: string;
  isDefaultTitle: boolean;
  onTitleChange: (title: string) => void;
  onTitleCommit: () => void;
  // An example or shared animation, not yet saved, which saving copies.
  copyOf: "example" | "shared" | null;
  hasUnsavedChanges: boolean;
  // Whether the animation is one of the browser's animations, which can be saved as a copy.
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onImport: () => void;
  onDownload: () => void;
  onDocumentation: () => void;
  onReference: (target: DocTarget) => void;
  onTour: () => void;
  onWelcome: () => void;
  onShare: () => void;
  onRender: () => void;
}

export default function AppHeader(props: Props) {
  const {phone, titleInput} = props;
  const canInstall = useCanInstall();
  const titleRef = useRef<HTMLInputElement>(null);
  return (
    <header className="appHeader">
      <a className="brand" href="./" aria-label="smoothstep.io home">
        <img src={asset("images/logo.svg")} width="24" height="24" alt="" />
        <span className="brandName">smoothstep<i>.io</i></span>
      </a>
      <TextInput
        id="titleInput" ref={titleRef} variant="unstyled" className="titleInput"
        value={titleInput} maxLength={MAX_TITLE_LENGTH}
        data-default={props.isDefaultTitle || undefined}
        aria-label="Title"
        onChange={event => props.onTitleChange(event.target.value)}
        onFocus={() => {
          if (titleInput === DEFAULT_TITLE) {
            titleRef.current?.select();
          }
        }}
        onBlur={props.onTitleCommit}
        onKeyDown={event => {
          if (event.key === "Enter") {
            titleRef.current?.blur();
          }
        }}
      />
      {props.copyOf &&
        <Tooltip label="Saving keeps a copy in your animations, and leaves this one as it is" withArrow>
          <Badge variant="light" color="gray" size="sm" className="sourceBadge">
            {props.copyOf === "example" ? "Example" : "Shared"}
          </Badge>
        </Tooltip>}
      <Group gap={4} wrap="nowrap" className="headerActions headerEnd">
        <Menu>
          <Menu.Target>
            <Button
              variant="subtle" color="gray" leftSection={phone ? <TbFile /> : undefined}
              rightSection={phone ? undefined : <TbChevronDown />}
            >
              File{phone && <TbChevronDown className="menuChevron" aria-hidden />}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item component="a" href="#new" leftSection={<TbFile />}>New</Menu.Item>
            <Menu.Item leftSection={<TbFolderOpen />} onClick={props.onOpen}>Open</Menu.Item>
            <Menu.Item
              leftSection={<TbDeviceFloppy />} onClick={props.onSave} fw={props.hasUnsavedChanges ? 600 : undefined}
              rightSection={props.touch ? undefined : <Kbd size="xs">{MOD_KEY} S</Kbd>}
            >{props.copyOf ? "Save a copy" : "Save"}</Menu.Item>
            {props.saved &&
              <Menu.Item leftSection={<TbCopy />} onClick={props.onSaveCopy}>Save copy</Menu.Item>}
            <Menu.Divider />
            <Menu.Item leftSection={<TbFileImport />} onClick={props.onImport}>
              Import…
              <Text size="xs" c="dimmed">From a file or a link</Text>
            </Menu.Item>
            <Menu.Item leftSection={<TbDownload />} onClick={props.onDownload}>
              Export
              <Text size="xs" c="dimmed">Download this animation as a file</Text>
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Menu position="bottom-end">
          <Menu.Target>
            <Button
              variant="subtle" color="gray" leftSection={phone ? <TbHelp /> : undefined}
              rightSection={phone ? undefined : <TbChevronDown />}
            >
              Help{phone && <TbChevronDown className="menuChevron" aria-hidden />}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<TbBook />} onClick={props.onDocumentation}>
              Documentation
            </Menu.Item>
            <Menu.Item leftSection={<TbCode />} onClick={() => props.onReference(DOC_SECTIONS.reference)}>
              Shader inputs
            </Menu.Item>
            <Menu.Item leftSection={<TbKeyboard />} onClick={() => props.onReference(DOC_SECTIONS.shortcuts)}>
              Keyboard shortcuts
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item component="a" href={TUTORIAL_HREF} leftSection={<TbSchool />}>Tutorial</Menu.Item>
            <Menu.Item leftSection={<TbRoute />} onClick={props.onTour}>Take the tour</Menu.Item>
            <Menu.Item leftSection={<TbHome />} onClick={props.onWelcome}>Welcome</Menu.Item>
            <Menu.Divider />
            <Menu.Item component="a" href={REPO_URL} target="_blank" rel="noreferrer" leftSection={<TbBrandGithub />}>
              Source code
            </Menu.Item>
            <Menu.Item
              component="a" href="https://classic.smoothstep.io/" target="_blank" rel="noreferrer"
              leftSection={<TbHistory />}
            >
              Classic smoothstep.io
              <Text size="xs" c="dimmed">Download your data until 19 December</Text>
            </Menu.Item>
            {canInstall &&
              <Menu.Item leftSection={<TbDeviceDesktopDown />} onClick={() => void install()}>
                Install as an app
                <Text size="xs" c="dimmed">Opens in a window of its own</Text>
              </Menu.Item>}
          </Menu.Dropdown>
        </Menu>
        <Tooltip label={`Save (${MOD_KEY} S)`}>
          <ActionIcon
            variant={props.hasUnsavedChanges ? "light" : "subtle"} color={props.hasUnsavedChanges ? undefined : "gray"}
            size="lg" aria-label="Save" className="saveButton" onClick={props.onSave}
          >
            <TbDeviceFloppy size={18} />
          </ActionIcon>
        </Tooltip>
        <Button variant="subtle" color="gray" leftSection={<TbShare />} onClick={props.onShare}>
          Share
        </Button>
        <Button variant="light" leftSection={<TbVideo />} className="exportButton" onClick={props.onRender}>
          Render
        </Button>
      </Group>
    </header>
  );
}
