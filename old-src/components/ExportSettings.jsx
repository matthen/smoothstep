import React from 'react';

import { Alert, Button, Col, Form, InputGroup, Modal, ProgressBar, Row, Spinner } from 'react-bootstrap';
import { FaAngleDown } from 'react-icons/fa';


class ExportSettings extends React.Component {

  constructor(props) {
    super(props);
    const isChrome = (
      /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor));
    this.state = {
      isChrome: isChrome,
      exportFps: this.props.exportFps,
      exportFpsValid: true,
      exportResolution: this.props.exportResolution,
      exportResolutionValid: true,
      disabled: false,
      showAdvanced: false,
    };
  }

  handleExportResolutionChange(event) {
    this.setState({exportResolution: event.target.value});
    let newExportResolution = Number(event.target.value);
    // Round up to an even number.
    newExportResolution = 2 * Math.ceil(newExportResolution / 2);
    newExportResolution = Math.round(newExportResolution);
    if (isNaN(newExportResolution) || newExportResolution <= 0) {
      this.setState({exportResolutionValid: false});
      return;
    }
    this.setState({exportResolutionValid: true});
    this.props.onExportResolutionChange(newExportResolution);
  }

  handleExportFpsChange(event) {
    this.setState({exportFps: event.target.value});
    let newExportFps = Number(event.target.value);
    newExportFps = Math.round(newExportFps);
    if (isNaN(newExportFps) || newExportFps <= 0) {
      this.setState({newExportFpsValid: false});
      return;
    }
    this.setState({newExportFpsValid: true});
    this.props.onExportFpsChange(newExportFps);
  }

  componentDidUpdate(newProps) {
    let newDisabled = newProps.exportRequested || newProps.encodingRunning;
    if (this.state.disabled === newDisabled) {
      return;
    }
    this.setState({disabled: newDisabled});
  }

  render() {
    return (
      <Modal
        show={this.props.show}
        backdrop="static"
        className="export"
        aria-labelledby="contained-modal-title-vcenter"
        onHide={() => this.props.onCancelExport()}
        centered
        keyboard={false}
      >
        <Modal.Header>
          <Modal.Title>
            Export video
            {this.state.disabled &&
              <Spinner animation="border" role="status" variant="primary" size="sm" />
            }
            </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form className={this.state.disabled ? "disabled" : ""}>
            <Row>
              <Form.Label column sm={4}>Resolution width</Form.Label>
              <Col>
                <InputGroup>
                  <Form.Control
                    value={this.state.exportResolution}
                    onChange={(event) => this.handleExportResolutionChange(event)}
                    isInvalid={!this.state.exportResolutionValid}
                    type="number"
                    min="16"
                    step="16"
                    disabled={this.state.disabled}
                  />
                  <InputGroup.Append>
                    <InputGroup.Text>px</InputGroup.Text>
                  </InputGroup.Append>
                </InputGroup>
              </Col>
            </Row>
            <Row>
              <Form.Label column sm={4}>Frame rate</Form.Label>
              <Col>
                <InputGroup>
                  <Form.Control
                    value={this.state.exportFps}
                    onChange={(event) => this.handleExportFpsChange(event)}
                    isInvalid={!this.state.exportFpsValid}
                    type="number"
                    min="6"
                    step="6"
                    disabled={this.state.disabled}
                  />
                  <InputGroup.Append>
                    <InputGroup.Text>fps</InputGroup.Text>
                  </InputGroup.Append>
                </InputGroup>
              </Col>
            </Row>
            <Row>
              <Form.Label column sm={4}>File type</Form.Label>
              <Col>
                <Form.Control as="select" value={this.props.exportType}
                  onChange={(event) => this.props.onExportTypeChange(event.target.value)}
                  disabled={this.state.disabled}
                >
                  <option value="webm">Webm video</option>
                  <option value="mp4">MP4 video</option>
                  <option value="png">PNG frames (.tar)</option>
                  <option value="gif">Animated GIF</option>
                </Form.Control>
              </Col>
            </Row>
            {this.props.exportType === "mp4" &&
              <>
                <Row>
                  <Col className="text-right">
                    <Button
                      className={"toggleAdvanced" + (this.state.showAdvanced ? " expanded" : " collapsed")}
                      size="sm"
                      variant="secondary"
                      onClick={() => this.setState({showAdvanced: !this.state.showAdvanced})}
                    >advanced <FaAngleDown /></Button>
                  </Col>
                </Row>
                <Row className={"advancedSettings" + (this.state.showAdvanced ? " expanded" : " collapsed")}>
                  <Form.Label column sm={4}>ffmpeg args</Form.Label>
                  <Col>
                    <Form.Control
                      value={this.props.ffmpegArgs}
                      onChange={(event) => this.props.onFfmpegArgsChange(event.target.value)}
                      disabled={this.state.disabled}
                    />
                  </Col>
                </Row>
              </>
            }
            {!this.state.isChrome &&
              <Row>
                <Col>
                  <Alert variant="warning">
                    Webm and MP4 currently only work in Chrome.
                    {this.state.isChrome ? "chrome" : "not chrome"}
                  </Alert>
                </Col>
              </Row>
            }
          </Form>
          {this.state.disabled && <hr />}
          {this.props.exportRequested &&
            <>
              <p>Rendering frames</p>
              <ProgressBar now={this.props.timeComplete} max={1} striped={true} animated key={1} className="noTransition" />
            </>
          }
          {this.props.encodingRunning &&
            <>
              <p>Encoding.</p>
              {this.props.encodingLogMessage &&
                <p className="encodingLog">{this.props.encodingLogMessage}</p>
              }
              <ProgressBar now={(this.props.encodingRunning ? 0.2 : 0.0) + 0.8 * Math.max(0., this.props.encodingProgress)} max={1} striped={true} animated key={2} />
            </>
          }
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => this.props.onCancelExport()}
          >Cancel</Button>
          <Button
            variant="primary"
            onClick={() => this.props.onRequestExport()}
            disabled={this.state.disabled}
          >Export</Button>
        </Modal.Footer>

      </Modal>
    );
  }
}

export default ExportSettings;
