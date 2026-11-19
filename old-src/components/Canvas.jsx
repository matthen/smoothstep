import React from 'react';
import { Alert } from 'react-bootstrap';
import { FaAngleLeft } from 'react-icons/fa';

import AspectRatioPicker from './AspectRatioPicker';
import textureURL from '../textureURL';

const MSG_WEBGL_REQUIRED = <>This page requires a browser that <a href="https://get.webgl.org/webgl2/">supports WebGL2</a>.</>;
const MSG_WEBGL_BROKEN = MSG_WEBGL_REQUIRED;
const MSG_PROGRAM_LINKING = <>Error in linking WebGL program.</>;

const FRAGMENT_HEADER = `#version 300 es
precision highp float;
`;
const VERTEX_SHADER = `#version 300 es
precision mediump float;
in vec4 a_position;

void main() {
  gl_Position = a_position;
}
`;
const COPY_PROGRAM = `
uniform sampler2D iTexture; uniform sampler2D iWatermark; uniform vec2 iResolution; uniform float iWatermarkA;
out vec4 fragColor;
void main() {
  vec4 image = texture(iTexture, gl_FragCoord.xy / iResolution.xy);
  vec2 uv = vec2(2., 8.) * (vec2(1., 0.) - vec2(iResolution.x - gl_FragCoord.x, -gl_FragCoord.y) / max(368., iResolution.x));
  uv.x = clamp(uv.x, 1., 2.);
  uv.y = clamp(uv.y, 0., 1.);
  vec4 watermark = texture(iWatermark, uv);
  fragColor = mix(image, watermark, 0.0 * watermark.a * iWatermarkA);
}
`;

class Canvas extends React.Component {

  constructor(props) {
    super(props);
    this.program = null;
    this.glContext = null;
    this.maxResolution = props.maxResolution || 1280;
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.forceRender = false;
    this.loadedTextures = {};
    this.state = {
      error: null,
      lineErrors: [],
      lastFrameTimestamp: null,
      lastTime: null,
      frameDurationUpdates: 0,
      frameDurationMs: 0.0,
      fps: null,
      marginTop: 0,
      marginSide: 0,
    };
  }

  showError(error) {
    this.setState({error: error});
  }

  createWebGLContext() {
      if (!window.WebGLRenderingContext) {
        return this.showError(MSG_WEBGL_REQUIRED);
      }
      try {
        const context = this.props.canvasRef.current.getContext('webgl2', {antialias: false});
        return context || this.showError(MSG_WEBGL_REQUIRED);
      }
      catch(e) {
        return this.showError(MSG_WEBGL_BROKEN);
      }
  }

  createShader(context, source, isFragment) {
    let type = isFragment ? context.FRAGMENT_SHADER : context.VERTEX_SHADER;
    let shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);

    let compiled = context.getShaderParameter(shader, context.COMPILE_STATUS);

    if (!compiled) {
        // Something went wrong during compilation; get the error
        let errorLog = context.getShaderInfoLog(shader);
        console.log(errorLog);
        if (isFragment) {
          this.parseErrors(errorLog);
        }
        context.deleteShader(shader);
        return;
    }

    return shader;
  }

  parseErrors(errorLog) {
    let errors = [];
    const re = /ERROR:\s+\d+:(\d+):\s+('.*)/g;
    let matches = re.exec(errorLog);
    while (matches) {
        const numLines = FRAGMENT_HEADER.match(/\r?\n/g).length + 3;
        const line = parseInt(matches[1]) - numLines;
        const error = matches[2];
        const index = errors.length;
        errors.push({index, line, error});
        matches = re.exec(errorLog);
    }
    this.setState({lineErrors: errors});
    this.props.onLineErrors(errors);
  }

  createProgram(context, vertexShader, fragmentShader) {
      let program = context.createProgram();
      context.attachShader(program, vertexShader);
      context.attachShader(program, fragmentShader);
      context.linkProgram(program);

      // Check the link status
      let linked = context.getProgramParameter(program, context.LINK_STATUS);
      if (!linked) {
        let info = context.getProgramInfoLog(program);
        console.log(info);
        return this.showError(MSG_PROGRAM_LINKING);
      }
      program.uniforms = {};
      program.uniformValues = {};
      return program;
  }

  recompileCanvas() {
    // Before the first resolution is set (componentDidMount's timeout); a new resolution recompiles.
    if (this.props.code === null || !this.props.resolution) {
      return;
    }
    const context = this.createWebGLContext();
    if (!context) { return; }

    let fullCode  = FRAGMENT_HEADER;
    fullCode += "\nuniform vec2 iResolution; uniform float iTime; uniform float iDuration; uniform int iFrame;";
    fullCode += "uniform sampler2D iPrevFrame; "
    for (let i = 0; i < this.props.textures.length; i++) {
      fullCode += "uniform sampler2D iTexture" + i + "; ";
    }
    for (let i = 0; i < this.props.variableValues.length; i++) {
      fullCode += "uniform float iFloat" + i + "; ";
    }
    fullCode += "\n" + this.props.code;
    fullCode += "\nout vec4 color;"
    fullCode += "void main() {  mainImage(color, gl_FragCoord.xy); color.a = 1.; }";


    this.setState({lineErrors: []});
    this.props.onLineErrors([]);
    let fragmentShader = this.createShader(context, fullCode, true);
    if (!fragmentShader) { return; }
    let vertexShader = this.createShader(context, VERTEX_SHADER, false);

    let program = this.createProgram(context, vertexShader, fragmentShader);
    if (!program) {
      return;
    }
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    this.defineVertexBuffer(context, program);

    // Create program for copying a buffer to canvas and adding watermark.
    fullCode = FRAGMENT_HEADER;
    fullCode += COPY_PROGRAM;
    fragmentShader = this.createShader(context, fullCode, true);

    vertexShader = this.createShader(
      context,
      VERTEX_SHADER,
      false);
    let copyProgram = this.createProgram(context, vertexShader, fragmentShader);
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);
    this.defineVertexBuffer(context, copyProgram);

    this.program = program;
    this.copyProgram = copyProgram;
    this.glContext = context;
    this.uniforms = {};
    this.recreateBuffers();
    this.loadTextures();
    this.props.updateFrameIndex(0);
  }

  defineVertexBuffer(context, program) {
    // Define Vertex buffer
    // TODO: do for copy program too
    let verticesLoc = context.getAttribLocation(program, 'a_position');

    const vao = context.createVertexArray();
    context.bindVertexArray(vao);

    let vertices = context.createBuffer();
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, vertices);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([
        // triangle 1:
        -1.0, -1.0,
        1.0, -1.0,
        -1.0, 1.0,

        // triangle 2:
        -1.0, 1.0,
        1.0, -1.0,
        1.0, 1.0]),
      context.STATIC_DRAW,
    );
    context.enableVertexAttribArray(verticesLoc);
    context.vertexAttribPointer(verticesLoc, 2, context.FLOAT, false, 0, 0);
  }

  recreateBuffers() {
    if (!this.glContext) {
      return;
    }
    this.inputBuffer = this.createBuffer(0);
    this.outputBuffer = this.createBuffer(1);
    this.setState({lastTime: null, lastFrameTimestamp: null});
  }

  swapBuffers() {
    let temp = this.inputBuffer;
    this.inputBuffer = this.outputBuffer;
    this.outputBuffer = temp;
  }


  createBuffer(index) {
    var texture = this.glContext.createTexture();
    this.glContext.activeTexture(this.glContext.TEXTURE0 + index);
    this.glContext.bindTexture(this.glContext.TEXTURE_2D, texture);
    this.glContext.texImage2D(
      this.glContext.TEXTURE_2D, 0,
      this.glContext.RGBA,
      this.props.resolution[0], this.props.resolution[1], 0,
      this.glContext.RGBA, this.glContext.UNSIGNED_BYTE, null);
    this.glContext.texParameteri(
      this.glContext.TEXTURE_2D, this.glContext.TEXTURE_MIN_FILTER, this.glContext.NEAREST);
    this.glContext.texParameteri(
      this.glContext.TEXTURE_2D, this.glContext.TEXTURE_MAG_FILTER, this.glContext.NEAREST);
    this.glContext.texParameteri(
      this.glContext.TEXTURE_2D, this.glContext.TEXTURE_WRAP_S, this.glContext.REPEAT);
    this.glContext.texParameteri(
      this.glContext.TEXTURE_2D, this.glContext.TEXTURE_WRAP_T, this.glContext.REPEAT);
    let buffer = this.glContext.createFramebuffer();
    buffer.index = index;
    buffer.texture = texture;
    return buffer;
  }

  uniform(program, method, type, name, ...value) {
    // The uniform locations are cached in this.uniforms;
    let uniform;
    if (program.uniforms.hasOwnProperty(name)) {
      uniform = program.uniforms[name];
    } else {
      uniform = this.glContext.getUniformLocation(program, name);
      program.uniforms[name] = uniform;
    }
    if (!uniform) {
      return false;
    }

    const uniformValue = program.uniformValues[name];
    if (!uniformValue || !floatsClose(uniformValue, value)) {
      this.glContext['uniform' + method].apply(
        this.glContext, [uniform].concat(value));
      program.uniformValues[name] = value;
    }
    return true;
  }

  loadTextures() {

    function setTexture(image, gl, glTexture, clamp) {
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0,
        gl.RGBA,
        gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
         gl.generateMipmap(gl.TEXTURE_2D);
      } else {
         gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);  // gl.CLAMP_TO_EDGE
         gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
         gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    }

    let textures = this.props.textures.slice();
    textures.unshift({url: "watermark.png"});

    for (let i = 0; i < textures.length; i++ ) {
      let texture = textures[i];
      let glTexture = this.glContext.createTexture();
      this.glContext.activeTexture(this.glContext.TEXTURE0 + 2 + i);
      this.glContext.bindTexture(this.glContext.TEXTURE_2D, glTexture);

      if (this.loadedTextures[texture.url]) {
        setTexture(this.loadedTextures[texture.url], this.glContext, glTexture);
      } else {
        // initialize as black:
        const pixel = new Uint8Array([0, 0, 0, 255]);  // opaque black
        this.glContext.texImage2D(
          this.glContext.TEXTURE_2D, 0,this.glContext.RGBA,
          1, 1, 0, this.glContext.RGBA, this.glContext.UNSIGNED_BYTE,
          pixel);

        // Load image.
        let image = new Image();
        image.onload = () => {
          setTexture(image, this.glContext, glTexture);
          this.loadedTextures[texture.url] = image;
          this.forceRender = true;
        }
        image.src = textureURL(texture);
      }
    }
  }

  renderCanvas() {
    if (!this.program || !this.glContext ) {
      return;
    }
    this.updateResolution();
    if (this.state.lastTime === this.props.time && !this.forceRender && !this.props.exportRequested) {
      this.requestAnimationFrameID = window.requestAnimationFrame(
        this.renderCanvas.bind(this));
      return;
    }
    this.forceRender = false;
    this.glContext.useProgram(this.program);
    this.swapBuffers();
    this.uniform(this.program, '1f', 'float', 'iTime', this.props.time);
    this.uniform(this.program, '1f', 'float', 'iDuration', this.props.duration);
    this.uniform(this.program, '2f', 'vec2', 'iResolution', this.props.resolution[0], this.props.resolution[1]);
    this.uniform(this.program, '1i', 'int', 'iFrame', this.props.frameIndex);
    // Set the texture uniforms.
    for (let i = 0; i < this.props.textures.length; i++) {
      this.uniform(this.program, "1i", 'sampler2D', "iTexture" + i, 3 + i);
    }
    // Set the variable values
    for (let i = 0; i < this.props.variableValues.length; i++) {
      this.uniform(this.program, '1f', 'float', "iFloat" + i, this.props.variableValues[i]);
    }

    this.uniform(
      this.program, '1i', 'sampler2D', 'iPrevFrame', this.inputBuffer.index);

    // Render to output
    this.glContext.bindFramebuffer(this.glContext.FRAMEBUFFER, this.outputBuffer);
    this.glContext.framebufferTexture2D(
      this.glContext.FRAMEBUFFER, this.glContext.COLOR_ATTACHMENT0,
      this.glContext.TEXTURE_2D, this.outputBuffer.texture, 0);
    this.glContext.viewport(0, 0, this.props.resolution[0], this.props.resolution[1]);
    this.glContext.drawArrays(this.glContext.TRIANGLES, 0, 6);

    // Output to canvas
    this.glContext.useProgram(this.copyProgram);
    this.glContext.bindFramebuffer(this.glContext.FRAMEBUFFER, null);
    this.uniform(this.copyProgram, '1i', 'sampler2D', 'iTexture', this.outputBuffer.index);
    this.uniform(this.copyProgram, '1i', 'sampler2D', 'iWatermark', 2);
    this.uniform(this.copyProgram, '1f', 'float', 'iWatermarkA', this.props.exportRequested ? 1.0 : 0.0);
    this.uniform(this.copyProgram, '2f', 'vec2', 'iResolution', this.props.resolution[0], this.props.resolution[1]);
    this.glContext.viewport(0, 0, this.props.resolution[0], this.props.resolution[1]);
    this.glContext.drawArrays(this.glContext.TRIANGLES, 0, 6);

    this.props.captureFrame();

    let now = Date.now();
    let newState = {};
    if (this.state.lastFrameTimestamp) {
      let frameDurationMs = this.state.frameDurationMs;
      frameDurationMs *= 0.9;
      frameDurationMs += 0.1 * (now - this.state.lastFrameTimestamp);
      newState.frameDurationUpdates = this.state.frameDurationUpdates +  1;
      newState.frameDurationMs = frameDurationMs;
      if ((newState.frameDurationUpdates % 10) === 0 && frameDurationMs > 0.0) {
        newState.fps = Math.round(1000.0 / frameDurationMs);
        // round to nearest 3 if high enough.
        if (newState.fps > 20) {
          newState.fps = Math.round(newState.fps / 3) * 3;
        }
      }
    }
    newState.lastFrameTimestamp = now;
    newState.lastTime = this.props.time;
    this.setState(newState);
    this.requestAnimationFrameID = window.requestAnimationFrame(
      this.renderCanvas.bind(this));
  }

  componentDidMount() {
    window.setTimeout(() => {
      this.updateResolution();
      this.recompileCanvas();
      this.renderCanvas();
    }, 60);
  }

  updateResolution() {
    let container = this.props.canvasRef.current.parentElement;
    let height = Math.min(this.maxResolution, container.clientHeight);
    let width = this.props.aspectRatio[0] * height / this.props.aspectRatio[1];
    const maxWidth = Math.min(this.maxResolution, container.clientWidth);
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
    height = Math.round(height);
    width = Math.round(width);
    const viewHeight = height;
    const viewWidth = width;
    this.props.updateViewResolution([viewWidth, viewHeight]);

    const canvasStyle = window.getComputedStyle(this.props.canvasRef.current);
    const marginTop = Number(canvasStyle.getPropertyValue("margin-top").match(/\d+/)[0]);
    const marginSide = Number(canvasStyle.getPropertyValue("margin-left").match(/\d+/)[0]);
    if (this.state.marginTop !== marginTop || this.state.marginSide !== marginSide) {
      this.setState({marginTop, marginSide});
      this.props.updatePlayerControlsTop(viewHeight + marginTop);
    }

    if (this.props.exportRequested) {
      width = this.props.exportResolution;
      height = Math.round(
        this.props.aspectRatio[1] * this.props.exportResolution / this.props.aspectRatio[0]);
      // Video encoding requires even dimensions.
      width = 2 * Math.ceil(width / 2);
      height = 2 * Math.ceil(height / 2);
    }
    if (this.props.resolution
        && this.props.resolution[0] === width
        && this.props.resolution[1] === height) {
      return;
    }
    this.props.updateResolution([width, height]);
  }

  componentWillUnmount() {
    window.cancelAnimationFrame(this.requestAnimationFrameID);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.code !== this.props.code
        || prevProps.textures !== this.props.textures
        || prevProps.resolution !== this.props.resolution) {
      this.recompileCanvas();
    }
    if (!floatsClose(prevProps.variableValues, this.props.variableValues)) {
      this.forceRender = true;
    }
  }

  render() {
    const viewResolution = this.props.viewResolution;
    return (
      <div id="canvasContainer">
        {this.state.error ? (<Alert variant="warning"> {this.state.error} </Alert>) : (
          <>
            <div
              id="toggleWideCanvas"
              onClick={() => this.props.toggleWideCanvas()}
              style={{
                left: this.state.marginSide - 32,
                top: this.state.marginTop + (viewResolution ? viewResolution[1] : 1) / 2,
              }}
            >
              <FaAngleLeft />
            </div>
            <canvas
              ref={this.props.canvasRef}
              id="canvas"
              width={this.props.resolution ? this.props.resolution[0] : 1}
              height={this.props.resolution ? this.props.resolution[1] : 1}
              style={{
                width: viewResolution ? viewResolution[0] : 1,
                height: viewResolution ? viewResolution[1] : 1,
              }}
            >
            </canvas>
            <AspectRatioPicker
              value={this.props.aspectRatio}
              onChange={(aspectRatio) => this.props.onChangeAspectRatio(aspectRatio)}
              top={this.state.marginTop + 8}
              left={this.state.marginSide + 8}
            />
            <div
              className={"fps" + (this.props.exportRequested ? " exporting" : "")}
              style={{top: this.state.marginTop + 8, right: this.state.marginSide + 8}}
            >
              {this.props.resolution &&
                <p>{this.props.resolution[0]}&times;{this.props.resolution[1]}px</p>}
              {this.state.fps ? <p> {this.state.fps} fps</p> : null}
              <p>{this.props.frameIndex}</p>
            </div>
          </>
        )}
      </div>
    );
  }
}

function isPowerOf2(value) {
  return (value & (value - 1)) === 0;
}

function floatsClose(floats1, floats2) {
  if (floats1.length !== floats2.length) {
    return false;
  }
  for (let i = 0; i < floats1.length; i++) {
    if (Math.abs(floats1[i] - floats2[i]) > 0.00001) {
      return false;
    }
  }
  return true;
}

export default Canvas;
