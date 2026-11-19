import ColorPicker from './pickers/ColorPicker';
import Vec3Picker from './pickers/Vec3Picker';
import Vec2Picker from './pickers/Vec2Picker';
import FloatPicker from './pickers/FloatPicker';
import Color from './pickers/types/Color';
import Modal from './Modal';
import glslFunctions from '../../glslFunctions.json';


function myExecAll(re, string) {
    let match =re.exec(string);
    let matches = [];
    while (match !== null) {
        let matchArray = [];
        for (let i in match) {
          if (i === "0") {
                matchArray.push(match[i]);
            }
        }
        matchArray.index = match.index;
        matches.push(matchArray);
        match = re.exec(string);
    }
    return matches;
};


class Helpers {

  constructor(editor) {

      this.editor = editor;

      this.properties = {
          linkButton: true
      };
      this.loadGlslFunctions();

      // EVENTS
      let wrapper = editor.getWrapperElement();


      wrapper.addEventListener('mouseup', (event) => {
          // bail out if we were doing a selection and not a click
          this.clean(event);
          if (this.somethingSelected()) {
            return;
          }

          let cursor = this.editor.getCursor(true);

          // see if there is a match on the cursor click
          let match = this.getMatch(cursor);
          let token = this.editor.getTokenAt(cursor);
          if (match) {
              // Toggles the trackpad to be off if it's already present.
              if (this.activeModal && this.activeModal.isVisible) {
                  this.activeModal.removeModal();
                  return;
              }

              if (match.type === 'color') {
                  const color = new Color(match.string);
                  const colorVec = color.get('vec');
                  if (
                    colorVec.v < 0.0 || colorVec.v > 1.0 ||
                    colorVec.e < 0.0 || colorVec.e > 1.0 ||
                    colorVec.c < 0.0 || colorVec.c > 1.0
                  ) {
                      this.activeModal = new Vec3Picker(match.string, this.properties);
                      this.activeModal.showAt(this.editor);
                      this.activeModal.on('changed', (dir) => {
                          let newDir = dir.getString('vec3');
                          let start = { line: cursor.line, ch: match.start };
                          let end = { line: cursor.line, ch: match.end };
                          match.end = match.start + newDir.length;
                          this.editor.replaceRange(newDir, start, end, `+${match.type}`);
                          this.editor.setSelection(start, end);
                      });
                  } else {

                    this.activeModal = new ColorPicker(match.string, this.properties);
                    this.activeModal.showAt(this.editor);
                    this.activeModal.on('changed', (color) => {
                        let newColor = color.getString('vec');
                        let start = { line: cursor.line, ch: match.start };
                        let end = { line: cursor.line, ch: match.end };
                        match.end = match.start + newColor.length;
                        this.editor.replaceRange(newColor, start, end, `+${match.type}`);
                        this.editor.setSelection(start, end);
                    });

                    this.activeModal.on('linkButton', (color) => {
                        this.activeModal = new Vec3Picker(color.getString('vec'), this.properties);
                        this.activeModal.showAt(this.editor);
                        this.activeModal.on('changed', (dir) => {
                            let newDir = dir.getString('vec3');
                            let start = { line: cursor.line, ch: match.start };
                            let end = { line: cursor.line, ch: match.end };
                            match.end = match.start + newDir.length;
                            this.editor.replaceRange(newDir, start, end, `+${match.type}`);
                            this.editor.setSelection(start, end);
                        });
                    });
                  }
              }
              else if (match.type === 'vec2') {
                  this.activeModal = new Vec2Picker(match.string, this.properties);
                  this.activeModal.showAt(this.editor);
                  this.activeModal.on('changed', (pos) => {
                      let newpos = pos.getString();
                      let start = { line: cursor.line, ch: match.start };
                      let end = { line: cursor.line, ch: match.end };
                      match.end = match.start + newpos.length;
                      this.editor.replaceRange(newpos, start, end, `+${match.type}`);
                      this.editor.setSelection(start, end);
                  });
              }
              else if (match.type === 'number') {
                  this.activeModal = new FloatPicker(match.string, this.properties);
                  this.activeModal.showAt(this.editor);
                  this.activeModal.on('changed', (number) => {
                      let newNumber = number.getString();
                      let start = { line: cursor.line, ch: match.start };
                      let end = { line: cursor.line, ch: match.end };
                      match.end = match.start + newNumber.length;
                      this.editor.replaceRange(newNumber, start, end, `+${match.type}`);
                      this.editor.setSelection(start, end);
                  });
              }
          }
        else if ((token.type === 'builtin' || token.type === 'variable-3') && this.glslFunctions[token.string]) {
            // TODO- add help for builtins
            const spec = this.glslFunctions[token.string];
            // this.main.visualDebugger.clean(event);
            let html = '';
            html = '<p class="oneLiner">' + spec.oneLiner;
            if (spec.helpUrl) {
              html += ' <a href="' + spec.helpUrl + '" title="Help for ' + spec.functionName + '" target="_blank">More</a>.'
            }
            html += '</p>\n';
            html += '<code>' + spec.signatures.join('\n<br />') + '</code>';

            this.activeModal = new Modal('ge_tooltip', { innerHTML: html });
            this.activeModal.showAt(this.editor);
        }
        else if (token.type === 'variable' && token.string.length > 1) {
            this.clean(event);
            this.iluminate(token.string);
        }
      });
   }

   loadGlslFunctions() {
     this.glslFunctions = {};
     glslFunctions.forEach(spec => {
        this.glslFunctions[spec.functionName] = spec;
     });
   }

  somethingSelected() {
    const selections = this.editor.listSelections();
    for (let i = 0; i < selections.length; i++) {
      if (selections[i].anchor.line !== selections[i].head.line  ||
          selections[i].anchor.ch !== selections[i].head.ch) {
        return true;
      }
    }
    return false;
  }

  iluminate (variable) {
      // Highlight all calls to a variable
      this.overlay = searchOverlay(variable, true);
      this.editor.addOverlay(this.overlay);
  }

  clean (event) {
      if (event && event.target && event.target.className === 'ge_assing_marker') {
          return;
      }
      if (this.overlay) {
          this.editor.removeOverlay(this.overlay, true);
      }
  }


  getMatch(cursor) {
       let types = ['color', 'vec2', 'number'];
       let rta;
       for (let i in types) {
           rta = this.getTypeMatch(cursor, types[i]);
           if (rta) {
               return rta;
           }
       }
       return;
   }

  getTypeMatch(cursor, type) {
       if (!type) {
           return;
       }
       let re;
       switch(type.toLowerCase()) {
           case 'color':
               re = /vec[3]\([-|\d|.|,\s]*\)/g;
               break;
           case 'vec2':
               re = /vec2\([-|\d|.|,\s]*\)/g;
               break;
           case 'number':
               re = /[-]?\d+\.\d+|\d+\.|\.\d+/g;
               break;
           default:
               console.error('invalid match selection');
               return;
       }
       let line = this.editor.getLine(cursor.line);
       let matches = myExecAll(re, line);

       if (matches) {
           for (let i = 0; i < matches.length; i++) {
               let val = matches[i][0];
               let len = val.length;
               let start = matches[i].index;
               let end = matches[i].index + len;
               if (cursor.ch >= start && cursor.ch <= end) {
                   return {
                       type: type,
                       start: start,
                       end: end,
                       string: val
                   };
               }
           }
       }
       return;
   }
}

function searchOverlay(query) {
    let queryRe = new RegExp(query.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&'), 'g');
    return {
        token: function(stream) {
            queryRe.lastIndex = stream.pos;
            var match = queryRe.exec(stream.string);
            if (match && match.index === stream.pos) {
                stream.pos += match[0].length || 1;
                return 'searching';
            }
            else if (match) {
                stream.pos = match.index;
            }
            else {
                stream.skipToEnd();
            }
        }
    };
}

export default Helpers;
