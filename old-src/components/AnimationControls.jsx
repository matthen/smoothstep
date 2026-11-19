import React from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import {FaTrash} from 'react-icons/fa';


class TransitionsHelper {
  constructor(transitions) {
    this.transitions = transitions;
  }

  computeValue(time) {
    if (this.transitions.length === 0) {
      return 0.0;
    }
    const timeDSecs = time * 10;
    let value = 0.0;
    if (this.transitions.length > 0) {
      value = this.transitions[0].startValue;
    }
    for (let i = 0; i < this.transitions.length; i++) {
      let transition = this.transitions[i];
      if ((transition.startDSecs <= timeDSecs) && (timeDSecs <= transition.endDSecs)) {
        return computeTransitionValue(transition, time);
      }
      else if (transition.endDSecs < timeDSecs) {
        value = transition.endValue;
      }
      else if (transition.startDSecs > timeDSecs) {
        break;
      }
    }
    return value;
  }

}

function computeTransitionValue(transition, time) {
  const timeDSecs = time * 10;
  const t = clamp((timeDSecs - transition.startDSecs) / (transition.endDSecs - transition.startDSecs));
  const a = transition.startValue;
  const b = transition.endValue;

  switch (transition.type) {
    case "smoothstep":
      const ss = t * t * (3.0 - 2.0 * t);
      return a * (1 - ss) + b * ss;

    case "step":
      return t > 0.5 ? b : a;

    default:
      if (transition.type !== "linear") {
        console.log("bad transition type", transition.type, "defaulting to linear");
      }
      return (1 - t) * a + t * b;
  }
}

function clamp(x) {
  return Math.max(0, Math.min(1, x));
}


class AnimationControls extends React.Component {
  constructor(props) {
    super(props);
    this.numVariables = this.props.numVariables;
    this.mainEl = React.createRef();
    this.state = {
      maxTime: null,
      hoverTransition: null,
      hoverStartFixed: false,
      selectedTransition: null,
      firstClick: true,
      draggingTransition: false,
      draggingScrubber: false,
      draggingDurationSlider: false,
      resizingLeftTransition: false,
      resizingRightTransition: false,
      draggingStartX: null,
      headerTicks: [],
      ticksAreTens: false,
    };
    this.handleKey = this.handleKey.bind(this);
    this.handleClickDocument = this.handleClickDocument.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.duration !== this.props.duration) {
      this.recalculateMaxTime();
    }
  }

  componentDidMount() {
    document.addEventListener("keydown", this.handleKey);
    document.addEventListener("keypress", this.handleKey);
    document.addEventListener("click", this.handleClickDocument);
    this.recalculateMaxTime();
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKey);
    document.removeEventListener("keypress", this.handleKey);
    document.removeEventListener("click", this.handleClickDocument);
  }

  handleKey(event) {
    if (event.target !== document.body || event.charCode !== 0) {
      return;
    }
    if (event.keyCode === 46 || event.keyCode === 8) {
      // Delete or backspace.
      if (this.state.selectedTransition && !this.state.selectedTransition.isHover) {
        this.deleteTransition(this.state.selectedTransition);
      }
    }
  }

  handleClickDocument(event) {
    // Deselect the selected transition once focus is lost.
    if (!this.mainEl.current.contains(event.target)) {
      // Clicked outside the main element.
      this.recalculateMaxTime();
      this.setState({selectedTransition: null});
    }
  }

  handleMouseDownScrubber(event) {
    let rect = event.currentTarget.parentElement.getBoundingClientRect();
    let x = event.clientX - rect.left;
    this.setState({draggingScrubber: true, draggingStartX: x});
    event.stopPropagation();
  }

  handleMouseDownDurationSlider(event) {
    let rect = event.currentTarget.parentElement.getBoundingClientRect();
    let x = event.clientX - rect.left;
    this.setState({
      draggingDurationSlider: true, draggingStartX: x,
      hoverTransition: null, selectedTransition: null});
    event.stopPropagation();
  }

  handleClickHeader(event) {
    let rect = event.currentTarget.parentElement.getBoundingClientRect();
    let x = event.clientX - rect.left + event.target.parentElement.parentElement.scrollLeft;
    let timeComplete = (x / 40.) / this.props.duration;
    this.props.onTimeChange(timeComplete);
  }

  recalculateMaxTime() {
    let maxTime = Math.ceil(this.props.duration + 0.5);
    for (let i = 0; i < this.props.variables.length; i++) {
      let transitions = this.props.variables[i].transitions;
      if (transitions.length > 0) {
        maxTime = Math.max(maxTime, 0.1 * transitions[transitions.length - 1].endDSecs);
      }
    }
    let headerTicks = Array.from({length: Math.ceil(maxTime)}, (x, i) => i);
    let ticksAreTens = false;
    if (maxTime > 1000) {
      headerTicks = headerTicks.filter((i) => ((i + 1) % 10) === 0);
      headerTicks.pop();
      ticksAreTens = true;
    }
    this.setState({maxTime, headerTicks, ticksAreTens});
  }

  addVariable() {
    let variables = this.props.variables.slice();
    variables.push({});
    this.props.onVariablesChange(variables);
  }

  deleteVariable(index) {
    let variables = this.props.variables.slice();
    variables.splice(index, 1);
    this.props.onVariablesChange(variables);
  }

  updateHover(event, i) {
    if (this.state.draggingScrubber) {
      let x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      let deltaX = x - this.state.draggingStartX;
      this.setState({draggingStartX: this.state.draggingStartX + deltaX});
      let timeComplete = (this.props.timeComplete * this.props.duration + deltaX / 40.0) / this.props.duration;
      timeComplete = Math.max(0.0, Math.min(1.0, timeComplete));
      this.props.onTimeChange(timeComplete);
      return;
    }

    if (this.state.draggingDurationSlider) {
      let x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      let deltaX = x - this.state.draggingStartX;
      this.setState({draggingStartX: this.state.draggingStartX + deltaX});
      let duration = (this.props.duration + deltaX / 40.0);
      duration = Math.max(0.0, duration);
      duration = Math.round(duration * 100) / 100;
      this.props.onDurationChange(duration);
      return;
    }

    if (this.state.selectedTransition && (
      this.state.draggingTransition ||
      this.state.resizingLeftTransition ||
      this.state.resizingRightTransition)) {

      let x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      let deltaX = x - this.state.draggingStartX;
      deltaX = 4 * Math.floor(deltaX / 4);
      this.setState({draggingStartX: this.state.draggingStartX + deltaX});

      let draggedTransition = Object.assign({}, this.state.selectedTransition);
      if (this.state.draggingTransition) {
        if (
          (draggedTransition.startDSecs === 0 && deltaX < 0 ) ||
          (draggedTransition.endDSecs === 10 * this.props.duration && deltaX > 0)
        ) { return; }
        draggedTransition.startDSecs += deltaX / 4;
        draggedTransition.endDSecs += deltaX / 4;
      } else if (this.state.resizingLeftTransition) {
        draggedTransition.startDSecs += deltaX / 4;
      } else if (this.state.resizingRightTransition) {
        draggedTransition.endDSecs += deltaX / 4;
      }
      draggedTransition.startDSecs = Math.max(0, draggedTransition.startDSecs);
      draggedTransition.endDSecs = Math.min(Math.floor(this.props.duration * 10), draggedTransition.endDSecs);
      draggedTransition.endDSecs = Math.max(draggedTransition.endDSecs, draggedTransition.startDSecs + 1);

      if (this.isTransitionInsertable(draggedTransition, true)) {
        this.updateSelectedTransition(draggedTransition);
      }
      return;
    }
    if (this.state.selectedTransition !== null && !this.state.selectedTransition.isHover) {
      return;
    }
    let y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    if (y < 4 || y > 23) {
      return;
    }

    if (!this.state.hoverStartFixed) {
      let x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      x -= 2;
      x = 4 * Math.floor(x / 4);
      x = Math.max(0, x);
      if (this.isTransitionInsertable({row: i, startDSecs: x / 4, endDSecs: x / 4 + 1})) {
        const value = (
          new TransitionsHelper(this.props.variables[i].transitions)
        ).computeValue(x / 4);

        this.setState({
          hoverTransition: {
            row: i,
            startDSecs: x / 4,
            endDSecs: null,
            isHover: true,
            startValue: value,
            isStartValueValid: true,
            endValue: value,
            isEndValueValid: true,
            type: "smoothstep",
          }
        });
      } else {
        this.setState({hoverTransition: null, selectedTransition: null});
      }
    } else {
      let x = event.clientX - event.currentTarget.getBoundingClientRect().left;
      x += 2;
      x = 4 * Math.floor(x / 4);
      x = Math.max((this.state.hoverTransition.startDSecs + 1) * 4, x);
      let hoverTransition = Object.assign({}, this.state.hoverTransition);
      hoverTransition.endDSecs = x / 4;
      if (this.isTransitionInsertable(hoverTransition)) {
        this.setState({hoverTransition});
      }
    }
    if (this.state.hoverTransition) {
      let copiedTransition = Object.assign({}, this.state.hoverTransition);
      this.setState({selectedTransition: copiedTransition});
    }
  }

  handleMouseDown() {
    if (this.state.hoverTransition === null) {
      return;
    }
    if (!this.state.hoverStartFixed) {
      let hoverTransition = Object.assign({}, this.state.hoverTransition);
      hoverTransition.endDSecs = hoverTransition.startDSecs + 1;
      this.setState({
        hoverStartFixed: true,
        hoverTransition: hoverTransition,
        selectedTransition: hoverTransition
      });
    }
  }

  handleMouseUp() {
    if (this.state.draggingDurationSlider) {
      // Round the duration to nearest tenth of a second.
      this.props.onDurationChange(Math.round(this.props.duration * 10.) / 10.);
    }
    this.setState({
      draggingTransition: false, resizingLeftTransition: false,
      resizingRightTransition: false, draggingScrubber: false,
      draggingDurationSlider: false,
    });
  }

  handleClick(event) {
    if (this.state.hoverTransition !== null && this.state.hoverStartFixed) {
      if (!this.state.firstClick || this.state.hoverTransition.endDSecs > this.state.hoverTransition.startDSecs + 1) {
        this.insertTransition(this.state.hoverTransition);
      }
      this.setState({firstClick: false});
      return false;
    }

    if (event.target.className !== "variableRow") {
      return;
    }
    if (this.state.selectedTransition && !this.state.selectedTransition.isHover) {
      this.recalculateMaxTime();
      this.setState({selectedTransition: null, firstClick: true});
    }
  }

  isTransitionInsertable(transition, ignoreSelected) {
    if (transition.startDSecs < 0 || transition.endDSecs > this.props.duration * 10) {
      return false;
    }
    let transitions = this.props.variables[transition.row].transitions;
    for (let i = 0; i < transitions.length; i++) {
      let transitionI = transitions[i];
      if (ignoreSelected && this.isTransitionSelected(transitionI)) {
        continue;
      }
      if (transitionI.startDSecs > transition.endDSecs) {
        break;
      }
      if ((transition.startDSecs < transitionI.endDSecs && transitionI.startDSecs < transition.endDSecs)) {
        return false;
      }
    }
    return true;
  }

  insertTransition(transition) {
    if (!this.isTransitionInsertable(transition)) {
      this.setState({hoverTransition: null, hoverStartFixed: false});
      return;
    }
    let transitions = this.props.variables[transition.row].transitions.slice();
    transitions.push(transition);
    transitions.sort((a, b) => a.startDSecs - b.startDSecs);
    let variables = this.props.variables.slice();
    variables[transition.row].transitions = transitions;
    transition.isHover = false;
    this.setState({
      hoverTransition: null, hoverStartFixed: false,
      selectedTransition: transition
    });
    this.props.onVariablesChange(variables);
  }

  deleteTransition(transition) {
    let transitions = this.props.variables[transition.row].transitions.slice();
    transitions = transitions.filter(x => x.startDSecs !== transition.startDSecs);
    let variables = this.props.variables.slice();
    variables[transition.row].transitions = transitions;
    this.setState({
      hoverTransition: null, hoverStartFixed: false,
      selectedTransition: null
    });
    this.props.onVariablesChange(variables);
    this.recalculateMaxTime();
  }

  updateSelectedTransition(transition) {
    this.deleteTransition(this.state.selectedTransition);
    this.insertTransition(transition);
  }

  handleClickTransition(transition) {
    if (!this.isTransitionSelected(transition)) {
      this.setSelectedTransition(transition);
      return false;
    }
  }

  handleMouseDownTransition(event, transition) {
    if (!this.isTransitionSelected(transition)) {
      return false;
    }
    let rect = event.currentTarget.getBoundingClientRect();
    let x = event.clientX - rect.left;
    if (x <= 2) {
      this.setState({resizingLeftTransition: true});
    } else if (x >= rect.right - rect.left - 4) {
      this.setState({resizingRightTransition: true});
    } else {
      this.setState({draggingTransition: true});
    }
    this.setState({draggingStartX: x + 4 * transition.startDSecs});
    return false;
  }


  setSelectedTransition(transition) {
    this.setState({selectedTransition: Object.assign({}, transition)});
  }

  isTransitionSelected(transition) {
    if (this.state.selectedTransition === null) {
      return false;
    }
    return (
      transition.row === this.state.selectedTransition.row
      && transition.startDSecs === this.state.selectedTransition.startDSecs);
  }

  isTransitionActive(transition) {
    const timeDSecs = (this.props.timeComplete * this.props.duration) * 10;
    return transition.startDSecs <= timeDSecs && transition.endDSecs >= timeDSecs;
  }

  updateSelectedStartValue(event) {
    let transition = Object.assign({}, this.state.selectedTransition);
    let value = event.target.value;
    if (value !== "") {
      value = Number(event.target.value);
    }
    transition.isStartValueValid = true;
    if (value === "" || isNaN(value)) {
      transition.isStartValueValid = false;
    }
    transition.startValue = value;
    this.updateSelectedTransition(transition);
  }

  updateSelectedEndValue(event) {
    let transition = Object.assign({}, this.state.selectedTransition);
    let value = event.target.value;
    if (value !== "") {
      value = Number(event.target.value);
    }
    transition.isEndValueValid = true;
    if (value === "" || isNaN(value)) {
      transition.isEndValueValid = false;
    }
    transition.endValue = value;
    this.updateSelectedTransition(transition);
  }

  updateSelectedType(event) {
    let transition = Object.assign({}, this.state.selectedTransition);
    let value = event.target.value;
    transition.type = value;
    this.updateSelectedTransition(transition);
  }

  render() {
    return (
      <div id="animationControls" ref={this.mainEl}>
        <div className="properties">
          { this.state.selectedTransition &&
            <>
              {!this.state.selectedTransition.isHover &&
                <Button variant="secondary"
                  onClick={() => this.deleteTransition(this.state.selectedTransition)}
                  className="delete"
                ><FaTrash /></Button>
              }
              <h4>
                iFloat{this.state.selectedTransition.row}
                {this.state.selectedTransition.startDSecs !== null &&
                  <span> {(this.state.selectedTransition.startDSecs * 0.1).toFixed(1)}
                  {this.state.selectedTransition.endDSecs !== null &&
                    <> &mdash; {(this.state.selectedTransition.endDSecs * 0.1).toFixed(1)}</>}s
                  </span>}
              </h4>
              {!this.state.selectedTransition.isHover &&
                <Form>
                  <Form.Group as={Row} controlId="startValueInput">
                    <Form.Label column xs="5">
                      start value
                    </Form.Label>
                    <Col xs="7">
                      <Form.Control
                        size="sm"
                        type="number"
                        value={this.state.selectedTransition.startValue}
                        step="0.1"
                        onChange={(event) => this.updateSelectedStartValue(event)}
                        isInvalid={!this.state.selectedTransition.isStartValueValid}
                      />
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row} controlId="endValueInput">
                    <Form.Label column xs="5">
                      end value
                    </Form.Label>
                    <Col xs="7">
                      <Form.Control
                        size="sm"
                        type="number"
                        value={this.state.selectedTransition.endValue}
                        step="0.1"
                        onChange={(event) => this.updateSelectedEndValue(event)}
                        isInvalid={!this.state.selectedTransition.isEndValueValid}
                      />
                    </Col>
                  </Form.Group>
                  <Form.Group controlId="typeInput" as={Row}>
                    <Form.Label column xs="5">transition</Form.Label>
                    <Col xs="7">
                      <Form.Control as="select"
                        value={this.state.selectedTransition.type}
                        onChange={(event) => this.updateSelectedType(event)}
                        size="sm"
                        variant="dark"
                      >
                        <option>smoothstep</option>
                        <option>step</option>
                        <option>linear</option>
                      </Form.Control>
                    </Col>
                  </Form.Group>
                </Form>
              }
            </>
          }
        </div>
        <div className="gridContainer">
          <div
          className={"header " + (this.state.ticksAreTens ? "tensTicks" : "")}
            onClick={(event) => this.handleClickHeader(event)}>
            {
              this.state.headerTicks.map(
                (i) => <p key={i}>{i + 1}</p>
              )
            }
          </div>
          <div className="timeArea"
            style={
                {
                  width: 40 * (this.state.maxTime) + 20,
                  cursor: (
                    this.state.resizingLeftTransition || this.state.resizingRightTransition ||
                    this.state.draggingScrubber || this.state.draggingDurationSlider
                  ) ? "ew-resize" : "pointer"
                }
              }

              onMouseDown={() => this.handleMouseDown()}
              onMouseLeave={() => {
                this.setState({
                  hoverTransition: null, firstClick: true, hoverStartFixed: false,
                  draggingScrubber: false, draggingDurationSlider: false,
                  draggingTransition: false, resizingLeftTransition: false,
                  resizingRightTransition: false});
                if (this.state.selectedTransition && this.state.selectedTransition.isHover) {
                  this.setState({selectedTransition: null});
                }
              }}
              onMouseUp={() => this.handleMouseUp()}
              onClick={(event) => this.handleClick(event)}
          >
            <div className="postDuration"
              style={{
                left: 40 * this.props.duration,
                width: 40 * ((this.state.maxTime) - this.props.duration) + 20,
                height: this.props.variables.length * 28,
              }}/>
            <div className="scrubber"
              onMouseDown={(event) => this.handleMouseDownScrubber(event)}
              style={{
                left: 40 * this.props.timeComplete * this.props.duration - 1,
                height: this.props.variables.length * 28,
                zIndex: this.state.hoverStartFixed ? 0 : 1000
              }}/>
            <div className="durationSlider"
              onMouseDown={(event) => this.handleMouseDownDurationSlider(event)}
              style={{
                left: 40 * this.props.duration - 1,
                height: this.props.variables.length * 28,
                zIndex: this.state.hoverStartFixed ? 0 : 1000
              }}/>
            <div className="filler">
              {
                this.props.variables.map(
                  (variable, i) => (
                    <div
                      key={i}
                      className="variableRow"
                      onMouseOver={() => this.setState({hoverRow: i})}
                      onMouseMove={(event) => this.updateHover(event, i)}
                      >
                      {variable.transitions.length > 0 &&
                        <div className="variableValue"
                          style={{
                            left: 40 * this.props.timeComplete * this.props.duration,
                            zIndex: this.state.hoverStartFixed ? 0 : 1000
                          }}
                        >
                          {this.props.variableValues[i].toFixed(2)}
                        </div>
                      }
                      {variable.transitions.map(
                        (transition, j) =>
                        <div
                          key={j}
                          className={
                            'transition' +
                            (this.isTransitionSelected(transition) ? ' selected': '') +
                            (this.isTransitionActive(transition) ? ' active': '')
                          }
                          style={
                            {
                              left: transition.startDSecs * 4,
                              width: (transition.endDSecs - transition.startDSecs) * 4,
                            }
                          }
                          onClick={() => this.handleClickTransition(transition)}
                          onMouseDown={(event) => this.handleMouseDownTransition(event, transition)}
                          >
                        </div>
                      )}
                      {(this.state.hoverTransition && this.state.hoverTransition.row === i  && this.state.hoverTransition.x !== null &&
                        <div className="transition hover" style={
                          {
                            left: this.state.hoverTransition.startDSecs * 4,
                            width: (this.state.hoverTransition.endDSecs !== null ? (
                              (this.state.hoverTransition.endDSecs - this.state.hoverTransition.startDSecs) * 4)
                              : 4)
                          }
                        }
                        ></div>
                      )}
                    </div>
                  )
                )
              }
            </div>
          </div>
        </div>
      </div>
    );
  }
}



export {AnimationControls, TransitionsHelper};
