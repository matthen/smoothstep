import React from 'react';

// An image which hides itself if it fails to load.
class ImageWithFallback extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      src: props.src,
      errored: false,
    };
  }

  onError = () => {
    if (!this.state.errored) {
      this.setState({errored: true});
    }
  }

  render() {
    const { src } = this.state;
    // eslint-disable-next-line no-unused-vars
    const { src: _1, fallbackSrc: _2, ...props } = this.props;
    return (
      <>
        {!this.state.errored &&
          <img
            src={src}
            onError={this.onError}
            alt={this.props.alt}
            {...props}
          />
        }
      </>
    );
  }
}

export default ImageWithFallback;
