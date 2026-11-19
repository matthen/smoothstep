import React from 'react';
import { FaBookOpen, FaGithub, FaInfoCircle } from "react-icons/fa";
import { Button, Col, ListGroup, Modal, Row } from 'react-bootstrap';

import { asset, documentHref, DOCS_URL, TUTORIAL_URL } from '../config';
import * as localStore from '../localStore';
import ImageWithFallback from './ImageWithFallback';

// Example animations, bundled in public/examples/ (<id>.json and an <id>.png thumbnail).
const EXAMPLES = [
  {id: "534226b1d5ed", title: "Minimal animation"},
  {id: "6c214a0d19e4", title: "Drawing a circle"},
  {id: "70bef4ffb215", title: "Fractals"},
  {id: "b2482911f435", title: "Using textures"},
  {id: "adb1df38284c", title: "Using the animation timeline"},
  {id: "f9ad362373e4", title: "3D ray tracing"},
  {id: "26d46785c1f6", title: "Stateful animations - iPrevFrame"},
];

const REPO_URL = "https://github.com/matthen/smoothstep";

class Splash extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      recentDocs: null,
    };
  }

  componentDidMount() {
    this.updateRecentDocs();
  }

  updateRecentDocs() {
    localStore.listDocuments().then(docs => this.setState({
      recentDocs: docs.length ? docs.slice(0, 3) : null,
    })).catch(error => console.log(error));
  }

  render() {
    return (
      <Modal
        show={this.props.show}
        onHide={() => this.props.onHide()}
        onShow={() => this.updateRecentDocs()}
        centered
        dialogClassName="splash"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <img
              src={asset("/images/logo.svg")}
              width="18"
              height="18"
              alt="smoothstep.io logo"
            /> smoothstep<i>.io</i>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Col sm={6}>
              <h1>Welcome</h1>
              <p>
                smoothstep.io is a toolkit for building animations in the WebGL Shader language.
              </p>
              <p>
                Animations and uploaded textures are saved in this browser. Use File &rarr; Open
                to download them as files, or to open files saved elsewhere.
              </p>
              <ListGroup>
                <ListGroup.Item action href={TUTORIAL_URL} target="_blank" rel="noreferrer">
                  <FaBookOpen />Getting started tutorial
                </ListGroup.Item>
                <ListGroup.Item action href={DOCS_URL} target="_blank" rel="noreferrer">
                  <FaInfoCircle />Documentation
                </ListGroup.Item>
                <ListGroup.Item action href={REPO_URL} target="_blank" rel="noreferrer">
                  <FaGithub />Source code
                </ListGroup.Item>
              </ListGroup>
              {this.state.recentDocs &&
                <>
                  <h4>Your Recent Animations</h4>
                  <ListGroup>
                    {this.state.recentDocs.map((doc) =>
                      <ListGroup.Item action href={documentHref(doc.id)} key={doc.id}>
                        {doc.thumbnail &&
                          <ImageWithFallback
                            src={doc.thumbnail}
                            width="24px"
                            height="24px"
                            alt="thumbnail"
                            className="thumbnail"
                          />
                        }
                        {doc.title}
                      </ListGroup.Item>
                    )}
                  </ListGroup>
                </>
              }
            </Col>
            <Col sm={6}>
              <h4>Examples</h4>
              <ListGroup>
                {EXAMPLES.map((example) =>
                  <ListGroup.Item action key={example.id} href={"#example/" + example.id}>
                    <ImageWithFallback
                      src={asset("/examples/" + example.id + ".png")}
                      width="24px"
                      height="24px"
                      alt="thumbnail"
                      className="thumbnail"
                    />
                    {example.title}
                  </ListGroup.Item>
                )}
              </ListGroup>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            href={TUTORIAL_URL}
            target="_blank"
            rel="noreferrer"
          >Tutorial</Button>
          <Button
            variant="primary"
            onClick={() => this.props.onHide()}
          >Continue</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

export default Splash;
