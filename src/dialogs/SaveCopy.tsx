import { useState, type FormEvent } from 'react';
import { Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { FaCopy } from 'react-icons/fa';

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

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    onSave(copy);
    onHide();
  };

  return (
    <Modal
      show={show} onHide={onHide} centered
      onShow={() => {setCopy(copyTitle(title)); setInputValue(copyTitle(title));}}
    >
      <Modal.Header closeButton>
        <Modal.Title><FaCopy /> Save copy</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={save}>
          <Row>
            <Form.Label column sm={4} htmlFor="saveCopyTitle">Title of copy:</Form.Label>
            <Col>
              <Form.Control
                id="saveCopyTitle" type="text" value={inputValue} maxLength={MAX_TITLE_LENGTH}
                onChange={event => handleChange(event.target.value)}
                onBlur={() => setInputValue(copy)}
              />
            </Col>
          </Row>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" onClick={() => save()}>Save copy</Button>
      </Modal.Footer>
    </Modal>
  );
}
