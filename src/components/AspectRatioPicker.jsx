import React from 'react';
import { Form, InputGroup } from 'react-bootstrap';
import { FaTv } from 'react-icons/fa';


const ASPECT_RATIOS = {
  "1_1": [1, 1],
  "4_3": [4, 3],
  "16_9": [16, 9],
  "3_4": [3, 4],
  "9_16": [9, 16],
};


class AspectRatioPicker extends React.Component {

  onChange(value) {
    const aspectRatio = ASPECT_RATIOS[value];
    if (this.props.onChange) {
      this.props.onChange(aspectRatio);
    }
  }

  render() {
    return (
      <div
        className="aspectRatioPicker"
        style={{top: this.props.top, left: this.props.left}}
      >
        <InputGroup className="mb-2" size="sm">
          <InputGroup.Prepend>
            <InputGroup.Text><FaTv /></InputGroup.Text>
          </InputGroup.Prepend>
          <Form.Control
            as="select"
            custom
            onChange={(event) => this.onChange(event.target.value)}
            value={this.props.value[0] + "_" + this.props.value[1]}
          >
            <option value="1_1">1:1</option>
            <option value="4_3">4:3</option>
            <option value="16_9">16:9</option>
            <option value="3_4">3:4</option>
            <option value="9_16">9:16</option>
          </Form.Control>
        </InputGroup>
      </div>
    );
  }
}

export default AspectRatioPicker;
