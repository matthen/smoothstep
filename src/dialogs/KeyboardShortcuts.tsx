import { Button, Group, Kbd, Table, Text, Title } from '@mantine/core';
import { Fragment } from 'react';

import AppModal from '../app/AppModal';
import { isMac } from '../app/platform';
import { usePhone } from '../app/usePhone';
import { combosFor, keyLabel, SHORTCUTS, type Shortcut } from './shortcuts';

interface KeyboardShortcutsProps {
  show: boolean;
  onHide(): void;
}

function Keys({shortcut}: {shortcut: Shortcut}) {
  return combosFor(shortcut, isMac).map((combo, i) =>
    <Fragment key={i}>
      {i > 0 && <span className="keysJoin">{shortcut.range ? " to " : " or "}</span>}
      <span className="keyCombo">
        {combo.map((key, j) =>
          <Fragment key={j}>{j > 0 && <span className="keysPlus">+</span>}<Kbd size="sm">{keyLabel(key, isMac)}</Kbd></Fragment>,
        )}
      </span>
    </Fragment>,
  );
}

export default function KeyboardShortcuts({show, onHide}: KeyboardShortcutsProps) {
  const phone = usePhone();
  return (
    <AppModal
      opened={show} onClose={onHide} title="Keyboard shortcuts" size="lg" fullScreen={phone}
      classNames={{body: "helpReference"}}
    >
      {SHORTCUTS.map(group =>
        <section key={group.title}>
          <Title order={2} size="h5" mb={4}>{group.title}</Title>
          {group.note && <Text size="sm" c="dimmed" mb="xs">{group.note}</Text>}
          <Table className="shortcutTable" verticalSpacing={6}>
            <Table.Tbody>
              {group.shortcuts.map(shortcut =>
                <Table.Tr key={shortcut.description}>
                  <Table.Td className="keysCell"><Keys shortcut={shortcut} /></Table.Td>
                  <Table.Td>{shortcut.description}</Table.Td>
                </Table.Tr>,
              )}
            </Table.Tbody>
          </Table>
        </section>,
      )}
      <Text size="sm" c="dimmed">
        Click a number, colour or vector in the code for a picker, and a built-in function, input or Canvas2D
        helper for its definition.
      </Text>
      <Group justify="flex-end" mt="lg"><Button variant="default" onClick={onHide}>Close</Button></Group>
    </AppModal>
  );
}
