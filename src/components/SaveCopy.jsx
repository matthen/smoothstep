import React from 'react';
import { FaCopy } from "react-icons/fa";
import { Button, Col, Form, Modal, NavDropdown, Row } from 'react-bootstrap';

const DEFAULT_TITLE = "Untitled animation";

// "Save copy" item for the File menu, which asks for the title of the copy.
class SaveCopy extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: this.props.title,
      titleInputValue: this.props.title,
      showModal: false,
    };
  }

  onShow() {
    let title = this.props.title;
    if (title.slice(-7) !== " (copy)") {
      title += " (copy)";
    }
    this.setState({title: title, titleInputValue: title});
  }

  onChange(value) {
    let title = value || DEFAULT_TITLE;
    title = title.slice(0, 32);
    this.setState({title: title, titleInputValue: value});
  }

  render() {
    return (
      <>
        <NavDropdown.Item
          onClick={() => this.setState({showModal: true})}
        ><FaCopy /> Save copy</NavDropdown.Item>
        <Modal
          show={this.state.showModal}
          onHide={() => this.setState({showModal: false})}
          onShow={() => this.onShow()}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title><FaCopy /> Save copy</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Row>
                <Form.Label column sm={4}>Title of copy:</Form.Label>
                <Col>
                  <Form.Control
                    type="text"
                    value={this.state.titleInputValue}
                    onChange={(event) => this.onChange(event.target.value)}
                    onBlur={() => this.setState({titleInputValue: this.state.title})}
                    maxLength="32"
                  />
                </Col>
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            {/* Note: the deployed build calls props.onHide here, which App never
                passes, so Cancel does nothing there. Closing the modal is the
                evident intent. */}
            <Button
              variant="secondary"
              onClick={() => this.setState({showModal: false})}
            >Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                this.setState({showModal: false});
                this.props.handleSave(this.state.title);
              }}
            >Save copy</Button>
          </Modal.Footer>
        </Modal>
      </>
    );
  }
}

export default SaveCopy;
