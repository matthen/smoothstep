import { useState } from 'react';
import { Button, Col, ListGroup, Modal, Row } from 'react-bootstrap';
import { FaBookOpen, FaGithub, FaInfoCircle } from 'react-icons/fa';

import {
  asset, documentHref, DOCS_URL, EXAMPLES, exampleHref, exampleThumbnail, REPO_URL, TUTORIAL_URL,
} from '../lib/config';
import { listDocuments, type DocumentSummary } from '../lib/localStore';
import ImageWithFallback from './ImageWithFallback';

interface SplashProps {
  show: boolean;
  onHide(): void;
}

export default function Splash({show, onHide}: SplashProps) {
  const [recentDocs, setRecentDocs] = useState<DocumentSummary[]>([]);

  const updateRecentDocs = () => {
    listDocuments().then(docs => setRecentDocs(docs.slice(0, 3))).catch(console.log);
  };

  return (
    <Modal show={show} onHide={onHide} onShow={updateRecentDocs} centered dialogClassName="splash">
      <Modal.Header closeButton closeVariant="white">
        <Modal.Title>
          <img src={asset("/images/logo.svg")} width="18" height="18" alt="smoothstep.io logo" /> smoothstep<i>.io</i>
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
            {recentDocs.length > 0 &&
              <>
                <h4>Your Recent Animations</h4>
                <ListGroup>
                  {recentDocs.map(doc =>
                    <ListGroup.Item action href={documentHref(doc.id)} key={doc.id} onClick={onHide}>
                      {doc.thumbnail &&
                        <ImageWithFallback src={doc.thumbnail} width="24px" height="24px" alt="thumbnail" className="thumbnail" />
                      }
                      {doc.title}
                    </ListGroup.Item>,
                  )}
                </ListGroup>
              </>
            }
          </Col>
          <Col sm={6}>
            <h4>Examples</h4>
            <ListGroup>
              {EXAMPLES.map(example =>
                <ListGroup.Item action key={example.id} href={exampleHref(example.id)} onClick={onHide}>
                  <ImageWithFallback
                    src={exampleThumbnail(example.id)}
                    width="24px" height="24px" alt="thumbnail" className="thumbnail"
                  />
                  {example.title}
                </ListGroup.Item>,
              )}
            </ListGroup>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" href={TUTORIAL_URL} target="_blank" rel="noreferrer">Tutorial</Button>
        <Button variant="primary" onClick={onHide}>Continue</Button>
      </Modal.Footer>
    </Modal>
  );
}
