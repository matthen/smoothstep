import { useState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Modal, ProgressBar, Row, Spinner } from 'react-bootstrap';

import type { ExportOptions, ExportProgress, ExportType } from './exportTypes';

interface ExportSettingsProps {
  show: boolean;
  options: ExportOptions;
  onOptionsChange(options: ExportOptions): void;
  onExport(): void;
  onCancel(): void;  // Also aborts a running export.
  progress: ExportProgress | null;  // null when idle
  error: string | null;
}

const FILE_TYPES: [ExportType, string][] = [
  ["webm", "Webm video"],
  ["mp4", "MP4 video"],
  ["png", "PNG frames (.zip)"],
  ["gif", "Animated GIF"],
];

// Parses a typed width (rounded up to even) or frame rate, or null if it isn't a positive number.
export function parseWidth(text: string): number | null {
  const width = 2 * Math.ceil(Number(text) / 2);
  return text.trim() && Number.isFinite(width) && width > 0 ? width : null;
}

export function parseFps(text: string): number | null {
  const fps = Math.round(Number(text));
  return text.trim() && Number.isFinite(fps) && fps > 0 ? fps : null;
}

export default function ExportSettings(
  {show, options, onOptionsChange, onExport, onCancel, progress, error}: ExportSettingsProps,
) {
  const [widthText, setWidthText] = useState(String(options.width));
  const [fpsText, setFpsText] = useState(String(options.fps));
  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setWidthText(String(options.width));
      setFpsText(String(options.fps));
    }
  }

  const disabled = progress !== null;
  const widthValid = parseWidth(widthText) !== null;
  const fpsValid = parseFps(fpsText) !== null;
  const noVideoEncoder = typeof VideoEncoder === "undefined" && (options.type === "webm" || options.type === "mp4");

  const handleWidth = (text: string) => {
    setWidthText(text);
    const width = parseWidth(text);
    if (width !== null) {
      onOptionsChange({...options, width});
    }
  };

  const handleFps = (text: string) => {
    setFpsText(text);
    const fps = parseFps(text);
    if (fps !== null) {
      onOptionsChange({...options, fps});
    }
  };

  return (
    <Modal show={show} backdrop="static" className="export" onHide={onCancel} centered keyboard={false}>
      <Modal.Header>
        <Modal.Title>
          Export video
          {disabled && <Spinner animation="border" role="status" variant="primary" size="sm" />}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form className={disabled ? "disabled" : ""} onSubmit={event => event.preventDefault()}>
          <Row>
            <Form.Label column sm={4} htmlFor="exportWidth">Resolution width</Form.Label>
            <Col>
              <InputGroup>
                <Form.Control
                  id="exportWidth" type="number" min="16" step="16" value={widthText}
                  onChange={event => handleWidth(event.target.value)}
                  isInvalid={!widthValid} disabled={disabled}
                />
                <InputGroup.Text>px</InputGroup.Text>
              </InputGroup>
            </Col>
          </Row>
          <Row>
            <Form.Label column sm={4} htmlFor="exportFps">Frame rate</Form.Label>
            <Col>
              <InputGroup>
                <Form.Control
                  id="exportFps" type="number" min="6" step="6" value={fpsText}
                  onChange={event => handleFps(event.target.value)}
                  isInvalid={!fpsValid} disabled={disabled}
                />
                <InputGroup.Text>fps</InputGroup.Text>
              </InputGroup>
            </Col>
          </Row>
          <Row>
            <Form.Label column sm={4} htmlFor="exportType">File type</Form.Label>
            <Col>
              <Form.Select
                id="exportType" value={options.type} disabled={disabled}
                onChange={event => onOptionsChange({...options, type: event.target.value as ExportType})}
              >
                {FILE_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </Form.Select>
            </Col>
          </Row>
          {noVideoEncoder &&
            <Row>
              <Col>
                <Alert variant="warning">
                  This browser can't encode video. Export a GIF or PNG frames instead, or use a
                  recent version of Chrome, Edge, Firefox or Safari.
                </Alert>
              </Col>
            </Row>
          }
        </Form>
        {error && <Alert variant="danger">{error}</Alert>}
        {progress && <hr />}
        {progress?.stage === "rendering" &&
          <>
            <p>Rendering frames</p>
            <ProgressBar now={progress.fraction} max={1} striped animated className="noTransition" />
          </>
        }
        {progress?.stage === "encoding" &&
          <>
            <p>Encoding.</p>
            <ProgressBar now={progress.fraction} max={1} striped animated />
          </>
        }
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onExport} disabled={disabled || !widthValid || !fpsValid}>Export</Button>
      </Modal.Footer>
    </Modal>
  );
}
