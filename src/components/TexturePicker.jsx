import React from 'react';

import { FaFileUpload, FaTrash } from 'react-icons/fa';
import { Alert, Button, Col, Modal, Nav, Row, Spinner, Tab } from 'react-bootstrap';
import Dropzone from 'react-dropzone'

import TextureData from '../textures.json';
import { asset } from '../config';
import * as localStore from '../localStore';
import textureURL from '../textureURL';

function uploadThumbURL(uuid) {
  return textureURL({isUserUploaded: true, url: uuid});
}


class TexturePicker extends React.Component {

  constructor(props) {
    super(props);
    this.textureData = TextureData;
    this.state = {
      activeKey: null,
      selectedKey: null,
      texture: null,
      isUserUploaded: null,
      selectedFile: null,
      isRejected: false,
      uploadInProgress: false,
      userUploaded: [],
      toDelete: null,
      showConfirm: false,
    };
  }

  handleShow() {
    let selectedKey = this.selectedKey(this.props.texture);
    this.setState({
      texture: this.props.texture,
      activeKey: this.selectedKey(this.props.texture),
      selectedKey: selectedKey,
    });
    this.updateUserUploaded();
  }

  selectedKey(texture) {
    if (texture.isUserUploaded) {
      return "uploads";
    }
    return texture.url.split("/")[0];
  }

  handleSelect(textureURL, isUserUploaded) {
    let newTexture = Object.assign({}, this.state.texture);
    newTexture.url = textureURL;
    newTexture.isUserUploaded = isUserUploaded;
    this.setState({
      texture: newTexture,
      selectedKey: this.selectedKey(newTexture),
    });
  }

  handleDelete(image) {
    this.setState({showConfirm: false});
    localStore.deleteImage(image.uuid).then(
        () => {
          this.updateUserUploaded();
          this.props.showAlert("Image deleted.");
        }
      ).catch(
        error => {
          console.log(error);
          this.props.showAlert("Error deleting image.");
        }
      );
  }

  listUserUploaded() {
    // Resolves to [{uuid, filename, width, height}].
    return localStore.listImages().then(images => images.map(
      ({id, filename, width, height}) => ({uuid: id, filename, width, height})));
  }

  updateUserUploaded() {
    // Textures in this animation that aren't in this browser's uploads (e.g. from an
    // animation opened from a file without its images) are listed separately.
    let otherUserUploaded = this.props.textures.filter(
      (texture) => texture.isUserUploaded
    );
    this.setState({otherUserUploaded});
    this.listUserUploaded().then(
        images => {
          this.setState({userUploaded: images});
          // Remove from otherUserUploaded.
          let uuids = {};
          images.forEach(image => {
            uuids[image.uuid] = true;
          });
          let otherUserUploaded = this.state.otherUserUploaded.slice();
          otherUserUploaded = otherUserUploaded.filter(
            (texture) => !uuids.hasOwnProperty(texture.url)
          );
          this.setState({otherUserUploaded});
        }
      ).catch(
        error => {
          this.props.showAlert("Error listing your images.")
        }
      );
  }

  handleUpload(event) {
    event.stopPropagation();
    this.setState({uploadInProgress: true});
    localStore.addUploadedImage(this.state.selectedFile).then(() => {
      this.props.showAlert("Image uploaded.");
      this.setState({uploadInProgress: false, activeKey: "uploads"});
      this.updateUserUploaded();
    }).catch((error) => {
      this.props.showAlert("Unable to upload image.");
      console.log(error);
      this.setState({uploadInProgress: false});
    });
  }

  openUploadForm() {
    this.setState({
      activeKey: "upload",
      selectedFile: null,
      isRejected: false,
      uploadInProgress: false,
    });
  }

  handleDrop(acceptedFiles) {
    if (acceptedFiles.length === 0) {
        this.setState({isRejected: true, selectedFile: null});
    } else {
      let file = acceptedFiles[0];
      file.preview = URL.createObjectURL(file);

      this.setState({selectedFile: acceptedFiles[0], isRejected: false});
    }
  }

  render() {
    return (
        <>
        <Modal
          show={this.props.show}
          onEscapeKeyDown={this.props.onHide}
          onHide={this.props.onHide}
          onShow={() => this.handleShow()}
          animation={true}
          restoreFocus={false}
          size="lg"
          aria-labelledby="contained-modal-title-vcenter"
          dialogClassName="texturePickerModal"
          centered
        >
          {this.state.texture &&
            <>
            <Modal.Header closeButton>
              <Modal.Title>{this.state.texture.id}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Tab.Container
                id="left-tabs-example"
                activeKey={this.state.activeKey}
                onSelect={(eventKey) => {
                  this.setState({activeKey: eventKey})
                }}
              >
              <Row>
                <Col sm={3}>
                  <Nav variant="pills" className="flex-column">
                    {Object.keys(this.textureData).map(
                      (key) =>
                        <Nav.Item
                          key={key}
                          className={(key === this.state.selectedKey) ? "selected" : null}
                        >
                          <Nav.Link eventKey={key}>{key}</Nav.Link>
                        </Nav.Item>
                    )}
                    <Nav.Item key="uploads">
                      <Nav.Link eventKey="uploads">user uploads</Nav.Link>
                    </Nav.Item>
                  </Nav>
                </Col>
                <Col sm={9}>
                  <Tab.Content>
                    {Object.keys(this.textureData).map(
                      (key) =>
                        <Tab.Pane key={key} eventKey={key}>
                          <div className="texturePickerGrid">
                            {
                              this.textureData[key].map(
                                (texture) => (
                                  <div
                                    className={"picker" + (texture.fname === this.state.texture.url ? " selected" : "")}
                                    key={texture.fname}
                                  >
                                    <button
                                      onClick={() => this.handleSelect(texture.fname, false)}
                                      className="select"
                                    >
                                      <img src={asset("/images/textures/" + texture.thumbnail_fname)} alt={texture.fname + " preview"} />
                                      <span className="resolution">{texture.width} &times; {texture.height}</span>
                                    </button>
                                  </div>
                                )
                              )
                            }
                          </div>
                        </Tab.Pane>
                    )}
                    <Tab.Pane key="uploads" eventKey="uploads">
                      <div className="texturePickerGrid">
                        <div className="picker">
                          <button onClick={() => this.openUploadForm()} className="select">
                            <FaFileUpload className="thumbnail" />
                            <span className="resolution">upload new image</span>
                          </button>
                        </div>
                        {this.state.otherUserUploaded.map(
                          (texture) => (
                            <div
                              className={"picker" + (texture.url === this.state.texture.url ? " selected" : "")}
                              key={texture.url}
                            >
                              <button
                                onClick={() => this.handleSelect(texture.url, true)}
                                className="select"
                              >
                                <img src={uploadThumbURL(texture.url)} alt={"texture preview"} />
                              </button>
                            </div>
                          )
                        )}
                        {
                          this.state.userUploaded.map(
                            (image) => (
                              <div
                                className={"picker" + (image.uuid === this.state.texture.url ? " selected" : "")}
                                key={image.uuid}
                              >
                                <button
                                  onClick={() => this.handleSelect(image.uuid, true)}
                                  className="select"
                                >
                                  <img src={uploadThumbURL(image.uuid)} alt={image.filename + " preview"} />
                                  <span className="resolution">{image.width} &times; {image.height}</span>
                                </button>
                                {(image.uuid !== this.state.texture.url) &&
                                  <Button size="sm" className="delete"
                                    onClick={() => this.setState({toDelete: image, showConfirm: true})}
                                  >
                                    <FaTrash />
                                  </Button>
                                }
                              </div>
                            )
                          )
                        }
                      </div>
                    </Tab.Pane>
                    <Tab.Pane key="upload" eventKey="upload">
                      <Dropzone
                            onDrop={acceptedFiles => this.handleDrop(acceptedFiles)}
                            maxFiles={1} accept="image/*"
                          >
                            {({getRootProps, getInputProps, isDragActive}) => (
                              <div {...getRootProps()} className={"dropzone" + (isDragActive ? " active" : "")}>
                                <input {...getInputProps()} />
                                <FaFileUpload className="uploadIcon"/>
                                <p>Drop image here, or click to select.</p>
                                <div className="selectedFile">
                                  {this.state.selectedFile &&
                                    <>
                                    <img src={this.state.selectedFile.preview} alt={this.state.selectedFile.name} />  {this.state.selectedFile.name}
                                    <Button
                                      onClick={(event) => this.handleUpload(event)}
                                      disabled={this.state.uploadInProgress}
                                    >
                                    Upload</Button>
                                    {this.state.uploadInProgress && <Spinner animation="border" role="status" variant="light" size="sm" />}
                                    </>}
                                  {this.state.isRejected &&
                                    <Alert variant="danger">
                                      File must be a single image.
                                    </Alert>
                                  }
                                </div>
                              </div>
                            )}
                          </Dropzone>
                    </Tab.Pane>

                  </Tab.Content>
                </Col>
              </Row>
            </Tab.Container>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="secondary"
                onClick={() => this.props.onHide()}
              >
                Cancel
              </Button>
              <Button variant="primary"
                onClick={() => this.props.onSelect(this.state.texture)}
              >
                Apply changes
              </Button>
            </Modal.Footer>
            </>
          }
        </Modal>
        {this.state.toDelete &&
          <Modal
            show={this.state.showConfirm}
            onHide={() => this.setState({showConfirm: false})}
            centered
            backdrop="static"
          >
            <Modal.Header closeButton>
            </Modal.Header>
            <Modal.Body>
              <p>Delete '<b>{this.state.toDelete.filename}</b>'?</p>
              <img
                src={uploadThumbURL(this.state.toDelete.uuid)} alt={this.state.toDelete.filename + " preview"}
                style={{maxHeight: 128, maxWidth: 128}}
              />

            </Modal.Body>
              <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => this.setState({showConfirm: false})}
              >Cancel</Button>
              <Button
                onClick={() => this.handleDelete(this.state.toDelete)}
                variant="danger"
              >Delete</Button>
            </Modal.Footer>
          </Modal>
        }
        </>
    );
  }
}

export default TexturePicker;
