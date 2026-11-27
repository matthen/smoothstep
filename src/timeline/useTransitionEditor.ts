import { useState } from 'react';

import { variableValue, type Transition, type Variable } from '../lib/document';
import { roundDSecs } from './geometry';
import type { Span } from './gestures';
import {
  insertTransition, isInsertable, parseValue, removeTransition, replaceTransition, withTransitions,
} from './transitions';
import type { Selection } from './useGestureState';

// Text typed into the value inputs, kept until it's valid and the input loses focus.
interface Drafts {
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
}

type ValueField = "start" | "end";
type TimeField = "startTime" | "endTime";

interface Options {
  variables: Variable[];
  onVariablesChange(variables: Variable[]): void;
  // The timeline's length in tenths of a second.
  maxDSecs: number;
  // The selection changed other than by dragging the selected transition.
  onSelect(): void;
}

// The selected transition, and the edits made to it in its boxes, by deleting it or by adding one.
export function useTransitionEditor({variables, onVariablesChange, maxDSecs, onSelect}: Options) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});

  const selectedIndex = selection === null ? -1 :
    variables[selection.row]?.transitions.findIndex(t => t.startDSecs === selection.startDSecs) ?? -1;
  const selected = selection && selectedIndex >= 0 ?
    variables[selection.row]?.transitions[selectedIndex] : undefined;

  function select(next: Selection | null) {
    setSelection(next);
    setDrafts({});
    onSelect();
  }

  function setRow(row: number, transitions: Transition[]) {
    onVariablesChange(withTransitions(variables, row, transitions));
  }

  function deleteSelected() {
    if (selection && selected) {
      setRow(selection.row, removeTransition(variables[selection.row]!.transitions, selectedIndex));
    }
    select(null);
  }

  function updateSelected(changes: Partial<Transition>) {
    if (selection && selected) {
      const transitions = variables[selection.row]!.transitions;
      setRow(selection.row, replaceTransition(transitions, selectedIndex, {...selected, ...changes}));
    }
  }

  function changeValue(field: ValueField, text: string) {
    setDrafts(d => ({...d, [field]: text}));
    const value = parseValue(text);
    if (value !== null) {
      updateSelected(field === "start" ? {startValue: value} : {endValue: value});
    }
  }

  function blurValue(field: ValueField) {
    const text = drafts[field];
    if (text !== undefined && parseValue(text) !== null) {
      setDrafts(d => ({...d, [field]: undefined}));
    }
  }

  // A typed start or end time in seconds, as tenths, or null if it isn't one the transition can take:
  // it has to stay after the one before, before the one after, within the timeline, and not empty.
  function typedTime(field: TimeField, text: string): number | null {
    const value = parseValue(text);
    if (!selection || !selected || value === null) {
      return null;
    }
    const dsecs = roundDSecs(value * 10);
    const startDSecs = field === "startTime" ? dsecs : selected.startDSecs;
    const endDSecs = field === "endTime" ? dsecs : selected.endDSecs;
    const transitions = variables[selection.row]!.transitions;
    return isInsertable(transitions, startDSecs, endDSecs, Math.max(maxDSecs, selected.endDSecs), selectedIndex) ?
      dsecs : null;
  }

  function changeTime(field: TimeField, text: string) {
    setDrafts(d => ({...d, [field]: text}));
    const dsecs = typedTime(field, text);
    if (dsecs !== null && selection) {
      updateSelected(field === "startTime" ? {startDSecs: dsecs} : {endDSecs: dsecs});
      if (field === "startTime") {
        setSelection({row: selection.row, startDSecs: dsecs});
      }
    }
  }

  function blurTime(field: TimeField) {
    setDrafts(d => ({...d, [field]: undefined}));
  }

  function create({row, startDSecs, endDSecs}: Span) {
    const transitions = variables[row]!.transitions;
    // A first transition starts from the value its slider set.
    const value = transitions.length > 0 ? variableValue(transitions, startDSecs / 10) : variables[row]!.value ?? 0;
    const inserted = insertTransition(transitions, {startDSecs, endDSecs, startValue: value, endValue: value, type: "smoothstep"});
    setRow(row, inserted.transitions);
    select({row, startDSecs});
  }

  // A drag moved the selected transition: the row as it now is, and where the transition starts.
  function moveSelected(row: number, transitions: Transition[], startDSecs: number) {
    setRow(row, transitions);
    setSelection({row, startDSecs});
  }

  return {
    selection, selected, selectedIndex, drafts, select, deleteSelected, updateSelected, changeValue, blurValue,
    typedTime, changeTime, blurTime, create, moveSelected,
  };
}
