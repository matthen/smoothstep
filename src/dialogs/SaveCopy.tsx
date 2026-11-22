import { Button, Group, TextInput } from '@mantine/core';
import { useState, type SubmitEvent } from 'react';

import AppModal from '../app/AppModal';
import { DEFAULT_TITLE, MAX_TITLE_LENGTH } from '../lib/document';

interface SaveCopyProps {
  show: boolean;
  title: string;
  onSave(title: string): void;
  onHide(): void;
}

const SUFFIX = " (copy)";

export function copyTitle(title: string): string {
  if (title.endsWith(SUFFIX)) {
    return title.slice(0, MAX_TITLE_LENGTH);
  }
  return title.slice(0, MAX_TITLE_LENGTH - SUFFIX.length) + SUFFIX;
}

// Asks for the title of the copy.
export default function SaveCopy({show, title, onSave, onHide}: SaveCopyProps) {
  const [copy, setCopy] = useState("");
  const [inputValue, setInputValue] = useState("");

  const handleChange = (value: string) => {
    setCopy((value || DEFAULT_TITLE).slice(0, MAX_TITLE_LENGTH));
    setInputValue(value);
  };

  const save = (event: SubmitEvent) => {
    event.preventDefault();
    onSave(copy);
    onHide();
  };

  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setCopy(copyTitle(title));
      setInputValue(copyTitle(title));
    }
  }

  return (
    <AppModal opened={show} onClose={onHide} title="Save copy">
      <form onSubmit={save}>
        <TextInput
          id="saveCopyTitle" label="Title of copy" value={inputValue} maxLength={MAX_TITLE_LENGTH} data-autofocus
          onChange={event => handleChange(event.target.value)}
          onBlur={() => setInputValue(copy)}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onHide}>Cancel</Button>
          <Button type="submit">Save copy</Button>
        </Group>
      </form>
    </AppModal>
  );
}
