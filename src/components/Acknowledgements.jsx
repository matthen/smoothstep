import React from 'react';
import { FaList } from "react-icons/fa";
import { Button, Modal } from 'react-bootstrap';

class Acknowledgements extends React.Component {

  render() {
    return (
        <Modal
          show={this.props.show}
          onHide={() => this.props.onHide()}
          centered
          dialogClassName="terms"
        >
          <Modal.Header closeButton>
            <Modal.Title>
              <FaList /> Acknowledgements
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              smoothstep.io was developed by <a href="https://twitter.com/matthen2" target="_blank" rel="noreferrer">Matt Henderson</a>.
            </p>
            <p>
              smoothstep.io is built on the work of a lot of open-source code,
              and I am grateful to all the projects that have been
              used in its development.
            </p>
            <p>
              I would like to highlight <a href="https://www.shadertoy.com/" target="_blank" rel="noreferrer">Shadertoy</a>,
              as an inspiration for smoothstep.io.
            </p>
            <p>
              Thanks to the following open-source projects in particular:
            </p>
            <ul>
              <li><a href="https://github.com/patriciogonzalezvivo/glslEditor" target="_blank" rel="noreferrer">glslEditor</a> - from the book of shaders</li>
              <li><a href="https://github.com/spite/ccapture.js" target="_blank" rel="noreferrer">CCapture</a></li>
              <li><a href="https://codemirror.net/" target="_blank" rel="noreferrer">CodeMirror</a></li>
              <li><a href="https://ffmpegwasm.github.io/" target="_blank" rel="noreferrer">FFMPEG.WASM</a></li>
              <li><a href="https://react-bootstrap.github.io/" target="_blank" rel="noreferrer">React Bootstrap</a></li>
              <li><a href="https://www.khronos.org/webgl/" target="_blank" rel="noreferrer">WebGL</a></li>
              <li><a href="https://github.com/dracula/dracula-theme/" target="_blank" rel="noreferrer">Dracula theme</a></li>
            </ul>

            <p>
              The default textures are free to reuse: CC0 photos from Flickr, public domain
              textures and NASA imagery, a photo under the Unsplash License, and work by
              Nicky and Matt Henderson. Thanks to the artists:
            </p>

            <ul>
              <li><a href="https://www.rnhenderson.com/" target="_blank" rel="noreferrer">Nicky Henderson</a></li>
              <li><a href="http://pdtextures.blogspot.com" target="_blank" rel="noreferrer">pdtextures.blogspot.com</a></li>
              <li><a href="https://unsplash.com/@joerga" target="_blank" rel="noreferrer">Jörg Angeli</a> on Unsplash</li>
              <li><a href="https://www.flickr.com/photos/188742053@N05" target="_blank" rel="noreferrer">Jenna Anthony</a></li>
              <li><a href="https://www.flickr.com/photos/dsoltesz" target="_blank" rel="noreferrer">Deborah Lee Soltesz</a></li>
              <li><a href="https://www.flickr.com/photos/andyweeks" target="_blank" rel="noreferrer">Andy Weeks</a></li>
              <li><a href="https://www.flickr.com/photos/kees-scherer" target="_blank" rel="noreferrer">Kees Scherer</a></li>
              <li><a href="https://www.flickr.com/photos/137236022@N03" target="_blank" rel="noreferrer">Pavel Kovalev</a></li>
              <li><a href="https://www.flickr.com/photos/86012097@N08" target="_blank" rel="noreferrer">akhenatenator</a></li>
              <li>NASA Goddard Space Flight Center (Blue Marble: Reto Stöckli, Robert Simmon)</li>
            </ul>

            <p>
              The font textures are drawn with Courier Prime, Arimo, Tinos, Inter and Exo 2,
              under the <a href="https://openfontlicense.org" target="_blank" rel="noreferrer">SIL Open Font License</a>.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => this.props.onHide()}
            >Close</Button>
          </Modal.Footer>
        </Modal>
    );
  }
}

export default Acknowledgements;
