import React from 'react';

import TexturePicker from './TexturePicker';
import textureURL from '../textureURL';


class Textures extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      selectedTexture: null,
      showPicker: false,
    };
  }

  handleClick(event, texture) {
    this.setState({
      selectedTexture: texture,
      showPicker: true,
    })
  }

  handleHide() {
    this.setState({
      showPicker: false,
      selectedTexture: null,
    });
  }

  handleSelect(texture) {
    this.props.onSelect(texture);
    this.handleHide();
  }

  render() {
    return (
      <div id='textures'>
        {
          this.props.textures.map(
            (texture) => <div className='texture' key={texture.id}>
              <h1>{texture.id}</h1>
              <button onClick={(event) => this.handleClick(event, texture)}>
                <img src={textureURL(texture)} alt={texture.id + " preview"} />
              </button>
            </div>
          )
        }
        <TexturePicker
          show={this.state.showPicker}
          texture={this.state.selectedTexture}
          textures={this.props.textures}
          onHide={() => this.handleHide()}
          onSelect={(texture) => this.handleSelect(texture)}
          showAlert={this.props.showAlert}
        />
      </div>
    );
  }
}

export default Textures;
