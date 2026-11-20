// The Learn panel: the tutorial's steps beside the editor, with checks that notice when you've
// done each one.
import { Button, CloseButton, Menu, UnstyledButton } from '@mantine/core';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  TbArrowLeft, TbArrowRight, TbCheck, TbChevronDown, TbCircleCheckFilled, TbCircleDashed, TbFileImport,
} from 'react-icons/tb';

import { tokenizeGlsl, type GlslToken } from '../editor/glslLanguage';
import { EXAMPLES, exampleHref, exampleThumbnail } from '../lib/config';
import { LESSONS, type Step, type TutorialState } from './lessons';
import { saveProgress, type TutorialProgress } from './progress';
import './tutorial.scss';

export interface TutorialPanelProps {
  initial: TutorialProgress;
  state: TutorialState;
  onPutCode(code: string): void;
  onLessonChange(lesson: number): void;
  onClose(): void;
}

const TOKEN_CLASSES: Record<GlslToken, string> = {
  "keyword": "tok-keyword", "typeName": "tok-type", "variableName.standard": "tok-builtin",
  "variableName": "tok-variable", "atom": "tok-atom", "number": "tok-number", "comment": "tok-comment",
  "string": "tok-string", "meta": "tok-meta", "operator": "tok-operator",
};

function HighlightedCode({code}: {code: string}) {
  const lines = useMemo(() => tokenizeGlsl(code.replace(/\n$/, "")), [code]);
  return (
    <pre className="learnCodeText">
      {lines.map((tokens, i) =>
        <Fragment key={i}>
          {tokens.map((token, j) => token.type
            ? <span key={j} className={TOKEN_CLASSES[token.type]}>{token.text}</span>
            : token.text)}
          {"\n"}
        </Fragment>,
      )}
    </pre>
  );
}

function lessonDone(lesson: number, completed: string[]): boolean {
  return LESSONS[lesson]!.steps.every(step => completed.includes(step.id));
}

export default function TutorialPanel({initial, state, onPutCode, onLessonChange, onClose}:
  TutorialPanelProps) {
  const [progress, setProgress] = useState(initial);
  const lesson = LESSONS[progress.lesson]!;
  const step: Step = lesson.steps[progress.step]!;

  // The editor as it was when this step opened, so checks can see what you've changed since.
  const key = progress.lesson + ":" + progress.step;
  const [start, setStart] = useState({key, state});
  if (start.key !== key) {
    setStart({key, state});
  }
  const atStart = start.key === key ? start.state : state;

  // A step without a check is done once you've seen it.
  const passed = step.check?.(state, atStart) ?? true;
  if (passed && !progress.completed.includes(step.id)) {
    setProgress(p => ({...p, completed: [...p.completed, step.id]}));
  }
  const done = progress.completed.includes(step.id) || passed;

  useEffect(() => saveProgress(progress), [progress]);

  const goTo = (lessonIndex: number, stepIndex: number) => {
    setProgress(p => ({...p, lesson: lessonIndex, step: stepIndex}));
    if (lessonIndex !== progress.lesson) {
      onLessonChange(lessonIndex);
    }
  };

  const isLastStep = progress.step === lesson.steps.length - 1;
  const isLastLesson = progress.lesson === LESSONS.length - 1;
  const next = () => {
    if (!isLastStep) {
      goTo(progress.lesson, progress.step + 1);
    } else if (!isLastLesson) {
      goTo(progress.lesson + 1, 0);
    } else {
      onClose();
    }
  };
  const back = () => {
    if (progress.step > 0) {
      goTo(progress.lesson, progress.step - 1);
    } else if (progress.lesson > 0) {
      goTo(progress.lesson - 1, LESSONS[progress.lesson - 1]!.steps.length - 1);
    }
  };

  const inEditor = step.code !== undefined && state.code === step.code;
  const emphasiseNext = done;

  return (
    <aside className="learnPanel" aria-label="Tutorial">
      <div className="learnHeader">
        <Menu position="bottom-start" width={280}>
          <Menu.Target>
            <UnstyledButton className="lessonPicker" aria-label="Choose a lesson">
              <span className="lessonNumber">{progress.lesson + 1}.</span>
              <span className="lessonTitle">{lesson.title}</span>
              <TbChevronDown aria-hidden />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {LESSONS.map((l, i) =>
              <Menu.Item
                key={l.title} onClick={() => goTo(i, 0)} fw={i === progress.lesson ? 600 : undefined}
                leftSection={<span className="lessonMenuNumber">{i + 1}</span>}
                rightSection={lessonDone(i, progress.completed)
                  ? <TbCheck className="lessonMenuDone" aria-label="Done" /> : null}
              >
                {l.title}
              </Menu.Item>,
            )}
          </Menu.Dropdown>
        </Menu>
        <CloseButton className="learnClose" aria-label="Close tutorial" onClick={onClose} />
      </div>

      <div className="learnSteps">
        <span className="learnStepCount">Step {progress.step + 1} of {lesson.steps.length}</span>
        <div className="learnDots">
          {lesson.steps.map((s, i) =>
            <button
              type="button" key={s.id} className="learnDot" aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === progress.step ? "step" : undefined}
              data-done={progress.completed.includes(s.id) || undefined}
              onClick={() => goTo(progress.lesson, i)}
            />,
          )}
        </div>
      </div>

      <div className="learnBody" key={key}>
        <h2 className="learnTitle">{step.title}</h2>
        <div className="learnProse">{step.body}</div>
        {step.code !== undefined &&
          <div className="learnCode">
            <div className="learnCodeBar">
              <span>GLSL</span>
              <Button
                size="compact-sm" variant={inEditor ? "subtle" : "light"} disabled={inEditor}
                leftSection={inEditor ? <TbCheck /> : <TbFileImport />}
                onClick={() => onPutCode(step.code!)}
              >
                {inEditor ? "In the editor" : "Put this in the editor"}
              </Button>
            </div>
            <HighlightedCode code={step.code} />
          </div>}
        {step.examples &&
          <div className="linkList learnExamples">
            {step.examples.flatMap(id => EXAMPLES.filter(e => e.id === id)).map(e =>
              <a className="linkItem" href={exampleHref(e.id)} target="_blank" rel="noreferrer" key={e.id}>
                <img src={exampleThumbnail(e.id)} width="40" height="40" alt="" className="thumbnail" />
                <span><b>{e.title}</b><br /><span className="learnExampleText">{e.description}</span></span>
              </a>,
            )}
          </div>}
      </div>

      <div className="learnFooter">
        {step.check &&
          <div className="learnStatus" data-done={done || undefined} role="status">
            {done
              ? <><TbCircleCheckFilled aria-hidden /><span><b>Done.</b> {isLastStep && isLastLesson ? "" : "On to the next step when you're ready."}</span></>
              : <><TbCircleDashed aria-hidden /><span>{step.task}</span></>}
          </div>}
        <div className="learnNav">
          <Button
            variant="subtle" color="gray" leftSection={<TbArrowLeft />} onClick={back}
            disabled={progress.lesson === 0 && progress.step === 0}
          >
            Back
          </Button>
          <Button
            variant={emphasiseNext ? "filled" : "default"} rightSection={isLastStep && isLastLesson ? undefined : <TbArrowRight />}
            onClick={next}
          >
            {!isLastStep ? "Next" : isLastLesson ? "Finish" : "Next lesson"}
          </Button>
        </div>
      </div>
    </aside>
  );
}
