import React from 'react';
import {Controlled as CodeMirror} from 'react-codemirror2';
import 'codemirror/addon/display/panel';
import Helpers from '../glslEditor/ui/Helpers.js';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import '../shaderMode.js';
import 'codemirror/addon/dialog/dialog';
import 'codemirror/addon/dialog/dialog.css';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/search/jump-to-line';
import 'codemirror/addon/search/matchesonscrollbar';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/search/search';
import 'codemirror/addon/scroll/annotatescrollbar';


const WORD_RE = /[a-zA-Z][\w$]*/;

class CodeEditor extends React.Component {
  constructor(props) {
    super(props);
    this.editor = null;
    this.helpers = null;
    this.widgets = [];
    this.errorPanel = null;
    this.hintTimer = null;
  }

  render() {
    const options = {
      tabSize: 2,
      indentWithTabs: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      lineNumbers: true,
      extraKeys: {
        'Shift-Enter': (cm) => { this.props.recompileCode(); },
        'Cmd-Enter': (cm) => { this.props.recompileCode(); },
        'Ctrl-Enter': (cm) => { this.props.recompileCode(); },
        'Ctrl-S': (cm) => { this.props.onSave(); },
        'Cmd-S': (cm) => { this.props.onSave(); },
        'Cmd-/' : 'toggleComment',
        'Ctrl-/' : 'toggleComment',
        'Shift-Tab': "indentAuto",
        'Tab': function(cm) {
          if (cm.somethingSelected()) { cm.indentSelection("add"); }
          else { cm.replaceSelection("  ");}
        }
      },
      theme: 'dracula',
      lineWrapping: true,
      mode: 'x-shader/x-fragment',
      dragDrop: false,
    };
    return (
      <CodeMirror
        value={this.props.value}
        onBeforeChange={(editor, data, value) => this.props.onChange(
          value, this.helpers.activeModal && this.helpers.activeModal.isVisible)}
        options={options}
        editorDidMount={(editor) => this.setupEditor(editor)}
      />
    );
  }


  setupEditor(editor) {
    this.editor = editor;
    this.helpers = new Helpers(this.editor);
    this.editor.on("keyup", (cm, event) => {
      if (this.hintTimer) {
        window.clearTimeout(this.hintTimer);
      }
      if (
        !cm.state.completionActive &&
        event.key.match(/^[a-zA-Z]$/)  // Only hint after typing a letter.
      ) {
        this.hintTimer = window.setTimeout(() => {
          cm.showHint({
            completeSingle: false,
            hint: (cm) => this.hint(cm),
          });
        }, 200);
      }
    });
  }

  hint(cm) {
    // Suggest hint completions while typing.
    let cursor = cm.getCursor();
    let currentToken = cm.getTokenAt(cursor);
    let currentWord = currentToken.string.trim();
    if (!currentWord) {
      return;
    }
    let words = cm.getHelper(cursor, "hintWords").slice();
    this.addNearbyWords(cm, currentWord, words);

    let from = {line: cursor.line, ch: currentToken.start};
    let to = cursor;
    let term = currentToken.string.substr(0, cursor.ch - currentToken.start);

    let found = [];
    for (var i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.slice(0, term.length) === term) {
        found.push(word);
      }
    }

    if (found) {
      return {list: found, from: from, to: to};
    }
  }

  addNearbyWords(cm, currentWord, words) {
    const range = 500;
    var cur = cm.getCursor(), curLine = cm.getLine(cur.line);
    var end = cur.ch, start = end;
    while (start && WORD_RE.test(curLine.charAt(start - 1))) --start;
    var re = new RegExp(WORD_RE.source, "g");
    var seen = {};
    for (let i = 0; i < words.length; i++) {
      seen[words[i]] = true;
    }
    for (var dir = -1; dir <= 1; dir += 2) {
      var line = cur.line, endLine = Math.min(
        Math.max(line + dir * range, cm.firstLine()), cm.lastLine()) + dir;
      for (; line !== endLine; line += dir) {
        var text = cm.getLine(line);
        let m = re.exec(text);
        while (m) {
          if (line === cur.line && m[0] === currentWord) {
            m = re.exec(text);
            continue;
          }
          if (
            m[0].lastIndexOf(currentWord, 0) === 0 &&
            !Object.prototype.hasOwnProperty.call(seen, m[0])
          ) {
            seen[m[0]] = true;
            words.push(m[0]);
          }
          m = re.exec(text);
        }
      }
    }
    return words;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.lineErrors === this.props.lineErrors) {
      return;
    }

    if (!this.editor) {
      return;
    }
    for (let i = 0; i < this.widgets.length; i++) {
      this.widgets[i].clear();
    }
    this.widgets = [];
    for (let i = 0; i < this.props.lineErrors.length; i++) {
      const error = this.props.lineErrors[i];
      let node = document.createElement('div');
      node.className = 'alert alert-danger';
      node.role = 'alert';
      node.innerText = error.error;
      const line = Math.max(0, Math.min(error.line, this.editor.lastLine()));
      this.widgets.push(
        this.editor.addLineWidget(
          line,
          node,
          {coverGutter: false},
        )
      );
      if ( i === 0) {
        this.editor.scrollIntoView({line: line, ch: 0});
      }
    }
  }
}

export default CodeEditor;
