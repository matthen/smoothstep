import {useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import {emptyVariables, variableValues} from "../../lib/document";
import type {Variable} from "../../lib/document";
import PlayerControls from "../PlayerControls";
import Timeline from "../Timeline";

function initialVariables(): Variable[] {
  const variables = emptyVariables();
  variables[0]!.transitions = [
    {startDSecs: 9, endDSecs: 28, startValue: 0, endValue: 1, type: "smoothstep"},
    {startDSecs: 32, endDSecs: 50, startValue: 1, endValue: 0, type: "smoothstep"},
  ];
  variables[1]!.transitions = [
    {startDSecs: 5, endDSecs: 25, startValue: 0.1, endValue: 0.3, type: "linear"},
    {startDSecs: 30, endDSecs: 50, startValue: 0.3, endValue: 0.1, type: "step"},
  ];
  return variables;
}

declare global {
  interface Window {
    __state: unknown;
  }
}

function Demo() {
  const [variables, setVariables] = useState(initialVariables);
  const [duration, setDuration] = useState(5);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const last = useRef<number | null>(null);

  useEffect(() => {
    let id = 0;
    const tick = (now: number) => {
      if (playing && !scrubbing && last.current !== null) {
        const dt = (now - last.current) / 1000;
        setTime(t => (t + dt > duration ? 0 : t + dt));
      }
      last.current = now;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, scrubbing, duration]);

  useEffect(() => {
    window.__state = {variables, duration, time, playing, scrubbing};
  });

  const changeDuration = (d: number) => {
    setDuration(d);
    setTime(t => Math.min(t, d));
  };

  return (
    <>
      <div style={{display: "flex", height: 600}}>
        <div style={{flex: 1, padding: 16}}>
          <div className="cm-editor"><div className="cm-content" contentEditable suppressContentEditableWarning
            style={{background: "#191a21", minHeight: 200, padding: 8}}>// fake code editor</div></div>
          <textarea id="otherTextarea" style={{marginTop: 8}} />
        </div>
        <div style={{width: 512, position: "relative", padding: "16px 16px 0"}}>
          <div id="canvas" style={{width: 480, height: 480, background: "#0b1b38"}} />
          <PlayerControls
            duration={duration} currentTime={time} isPlaying={playing}
            onSeek={setTime} onPlayPause={() => setPlaying(p => !p)} onReset={() => setTime(0)}
            onDurationChange={changeDuration}
            onScrubStart={() => setScrubbing(true)} onScrubEnd={() => setScrubbing(false)}
            width={480} top={496}
          />
        </div>
      </div>
      <footer style={{height: 272, paddingTop: 8, paddingBottom: 28, overflow: "hidden"}}>
        <div style={{padding: 8, background: "#282a36", height: 272 - 28 - 38}}>
          <Timeline
            variables={variables} variableValues={variableValues(variables, time)}
            onVariablesChange={setVariables} duration={duration} currentTime={time}
            onSeek={setTime} onDurationChange={changeDuration}
          />
        </div>
      </footer>
    </>
  );
}

document.body.style.background = "#282a36";
document.body.style.color = "#f8f8f2";
createRoot(document.getElementById("appRoot")!).render(<Demo />);
