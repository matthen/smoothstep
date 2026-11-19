import React from 'react';
import { Button, ButtonGroup, Container, Col, InputGroup, FormControl, OverlayTrigger, Row, Tooltip } from 'react-bootstrap';
import { FaPlay, FaPause, FaStepBackward } from "react-icons/fa";
import { Slider, Direction, FormattedTime } from 'react-player-controls';


class PlayerControls extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      hoverValue: null,
      durationValid: true,
      duration: this.props.duration,
      width: 200,
    };
    this.handleKeyPress = this.handleKeyPress.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  componentDidMount() {
    document.addEventListener("keypress", this.handleKeyPress);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener("keypress", this.handleKeyPress);
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.duration !== this.props.duration) {
      this.setState({duration: this.props.duration});
    }
    if (prevProps.width !== this.props.width && !isNaN(this.props.duration)) {
      this.setState({width: Math.max(this.props.width, 200)});
    }
  }

  handleKeyPress(event) {
    if (event.target !== document.body) {
      return;
    }
    let pressedKey = event.keyCode;
    if (pressedKey === 32) {  // space
      this.props.onPlayClick();
      event.preventDefault();
    }
    if (pressedKey >= 48 && pressedKey <= 57) {
      // 0 to 9
      this.props.onChange((pressedKey - 48) / 10);
      event.preventDefault();
    } else if (pressedKey === 44 || pressedKey === 46) {  // comma / full stop
      let deltaT = 1. / 60.;
      deltaT *= (pressedKey === 46 ? 1. : -1);
      let newTime = (
        this.props.timeComplete * this.props.duration + deltaT
      );
      newTime = Math.min(this.props.duration, Math.max(0.0, newTime));
      this.props.onChange(newTime / this.props.duration);
      event.preventDefault();
    }
  }

  handleKeyDown(event) {
    if (event.target !== document.body) {
      return;
    }
    let pressedKey = event.keyCode;
    if (pressedKey === 37 || pressedKey === 39) {  // left / right
      let deltaT = (pressedKey === 39 ? 0.1 : -0.1);
      let newTime = (
        this.props.timeComplete * this.props.duration + deltaT
      );
      newTime = Math.min(this.props.duration, Math.max(0.0, newTime));
      newTime = Math.round(newTime * 10) / 10;
      this.props.onChange(newTime / this.props.duration);
      event.preventDefault();
    }
  }

  handleDurationChange(event) {
    this.setState({duration: event.target.value});
    const newDuration = Number(event.target.value);
    if (isNaN(newDuration) || newDuration <= 0) {
      this.setState({durationValid: false});
      return;
    }
    this.setState({durationValid: true});
    this.props.onDurationChange(newDuration);
  }

  handleResetButton() {
      this.setState({hoverValue: null});
      this.props.onChange(0.0);
  }

  handlePlayButton() {
    this.props.onPlayClick();
  }

  handleChange(newValue) {
    this.setState({
      hoverValue: newValue,
    });
    this.props.onChange(newValue);
  }

  handleIntent(value) {
    this.setState({
      hoverValue: value,
    });
    this.props.onIntent(value);
  }

  handleIntentEnd() {
    this.setState({
      hoverValue: null,
    });
    this.props.onIntentEnd();
  }

  render() {
    return (
      <Container className='playerButtons' style={{top: this.props.top}}>
        <Row style={{
          width: this.state.width,
        }}>
          <Col xs={2} className='buttonsCol'>
            <ButtonGroup>
              <Button size="sm" variant='light' onClick={() => this.handleResetButton()}>
                <FaStepBackward />
              </Button>
              <Button size="sm" variant='light' onClick={() => this.handlePlayButton()}>
                { this.props.isPlaying ? <FaPause /> : <FaPlay />}
              </Button>
            </ButtonGroup>
          </Col>
          <Col className="scrubberCol">
            <Slider
              className='slider'
              direction={Direction.HORIZONTAL}
              onIntent={intent => this.handleIntent(intent)}
              onIntentEnd={() => this.handleIntentEnd()}
              onChangeEnd={() => this.handleIntentEnd()}
              onChange={newValue => this.handleChange(newValue)}
            >
              <div className='timeBar'></div>
              <div style={{left: `${this.props.timeComplete * 100}%`}} className='sliderHandle' />
              { this.state.hoverValue !== null && (
                <div style={{left: `${this.state.hoverValue * 100}%`}} className='timeTooltip'>
                  <FormattedTime numSeconds={this.state.hoverValue * this.props.duration} />
                </div>
              )}
            </Slider>
          </Col>
          <Col xs={2} className='durationCol'>
            <OverlayTrigger
              placement='bottom'
              delay={{ show: 250, hide: 400 }}
              overlay={
                <Tooltip>Duration in seconds</Tooltip>
              }
            >
              <InputGroup size="sm" >
                <FormControl
                  className="durationInput"
                  aria-label="Duration (seconds)"
                  value={this.state.duration}
                  onChange={(event) => this.handleDurationChange(event)}
                  isInvalid={!this.state.durationValid}
                  type="number"
                  step="1" min="1"
                  plaintext={this.state.durationValid}
                />
              </InputGroup>
            </OverlayTrigger>
          </Col>
        </Row>
      </Container>
    );
  }
}

export default PlayerControls;
