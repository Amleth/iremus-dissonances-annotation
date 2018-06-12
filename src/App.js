import React, { Component } from 'react';
import verovio from 'verovio-dev';
import { ANNOTATION_TYPE_PITCHSUBTYPE, ANNOTATION_TYPE_PITCHTYPE, OFFSET, parse, toXML } from './Analysis';
import './App.css';

const PT_PST_SEP = '—';
const AD_ICON = '⁕';

const tk = new verovio.toolkit();

const sleep = time => new Promise(resolve => setTimeout(resolve, time));

const makeAnnotationString = (analysis_annotation, corrected_annotation, analyticalDivisions) => {
  const x = (corrected_annotation && corrected_annotation[ANNOTATION_TYPE_PITCHTYPE]) || analysis_annotation[ANNOTATION_TYPE_PITCHTYPE];
  const y = (corrected_annotation && corrected_annotation[ANNOTATION_TYPE_PITCHSUBTYPE]) || analysis_annotation[ANNOTATION_TYPE_PITCHSUBTYPE];

  let _ = y ? x + PT_PST_SEP + y : x;
  if (analyticalDivisions > 1) _ += AD_ICON.repeat(analyticalDivisions - 1);

  return _;
};

const hasBeenModified = annotations => annotations.map(_ => {
  if (_[ANNOTATION_TYPE_PITCHTYPE] || _[ANNOTATION_TYPE_PITCHSUBTYPE]) return true;
  return false;
}).indexOf(true) !== -1;

const save = (key, state) => {
  if (!key) return;

  const clone_state = {};
  for (const key in state) {
    if (key === 'error') continue;
    if (key === 'score') continue;
    if (key === 'noteId') continue;
    clone_state[key] = { ...state[key] };
  }

  window.localStorage.setItem(key, JSON.stringify(clone_state));
};

class App extends Component {

  constructor() {
    super();

    this.analysisAnnotationsCreated = false;
    this.state = { error: false };

    this.noteIdOnlyInAnalysis = [];
  }

  annotateNote(noteId, analysis_annotations, corrected_annotations) {
    const note = document.getElementById(noteId);
    if (!note) {
      this.noteIdOnlyInAnalysis.push(noteId);
      return;
    }

    let annotation = makeAnnotationString(
      analysis_annotations[0],
      corrected_annotations[0],
      analysis_annotations.length
    );

    let x;
    let y;
    for (const cn of note.childNodes) {
      if (cn.nodeName !== 'use')
        continue;
      x = cn.x.baseVal.value;
      y = cn.y.baseVal.value;
    }

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', x);
    fo.setAttribute('y', y - 400);
    fo.setAttribute('width', 1);
    fo.setAttribute('height', 1);
    const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.setAttribute('class', hasBeenModified(corrected_annotations) ? 'correctedAnnotation' : 'annotation');
    div.appendChild(document.createTextNode(annotation));
    fo.appendChild(div);
    note.appendChild(fo);
  };

  componentDidMount() {
    import('./config.js').then(_ => {
      this.meiUserPath = _.mei;
      Promise.all([
        import(`${_.mei}`),
        import(`${_.xml}`)
      ])
        .then(([meiPath, xmlPath]) => {
          Promise.all([
            fetch(meiPath)
              .then(_ => _.text()),
            fetch(xmlPath)
              .then(_ => _.text())
              .then(str => new window.DOMParser().parseFromString(str, 'text/xml'))
          ])
            .then(([mei, xml]) => {
              this.analysisXML = xml;
              this.init(this.meiUserPath, mei, xml);
            })
        });
    });
  }

  reset() {
    //TODO
    this.analysisAnnotationsCreated = false;
    this.meiUserPath = undefined;
    this.noteIdOnlyInAnalysis = [];
  }

  init(meiUserPath, mei, xml) {
    const saveString = window.localStorage.getItem(meiUserPath);
    if (saveString) {
      const save = JSON.parse(saveString);
      this.setState({
        ...save,
        score: tk.renderData(mei, {
          adjustPageHeight: true,
          ignoreLayout: 1,
          pageHeight: 60000
        })
      });
    }
    else {
      const { analysis, maxAnalyticalDivisions, offsets } = parse(xml);

      // Annotations

      const allNotesAnnotations = {};
      const makeDefaultAnnotations = from_annotations => {
        const annotations = [];
        for (let i = 0; i < from_annotations.length; i++) {
          annotations.push({
            [ANNOTATION_TYPE_PITCHTYPE]: '',
            [ANNOTATION_TYPE_PITCHSUBTYPE]: '',
            [OFFSET]: from_annotations[i][OFFSET]
          });
        }
        return annotations;
      };

      for (const noteId in analysis) {
        allNotesAnnotations[noteId] = makeDefaultAnnotations(analysis[noteId]);
      }

      // Offsets & Roots

      const correctedOffsets = {};
      for (const offset in offsets) {
        correctedOffsets[offset] = undefined;
      }

      // Update state

      this.setState({
        allNotesAnnotations,
        analysis,
        correctedOffsets,
        maxAnalyticalDivisions,
        offsets: offsets,
        score: tk.renderData(mei, {
          adjustPageHeight: true,
          ignoreLayout: 1,
          pageHeight: 60000
        })
      });
    }
  }

  componentDidUpdate() {
    if (this.analysisAnnotationsCreated || !this.state.score || !this.state.analysis) return;

    for (const noteId in this.state.analysis) {
      this.annotateNote(noteId, this.state.analysis[noteId], this.state.allNotesAnnotations[noteId]);
    }

    if (this.noteIdOnlyInAnalysis.length > 0) {
      console.log('noteId present in XML but not in SVG:', this.noteIdOnlyInAnalysis);
      this.setState({ error: true });
    }

    this.analysisAnnotationsCreated = true;
  }

  handleClick = e => {
    if ('note' !== e.target.parentNode.className.baseVal) {
      this.setState({ noteId: null });
    } else {
      const noteId = e.target.parentNode.id;
      this.setState({ noteId });
    }
  };

  handleChangeAnnotation = (i, annotationType, value) => {
    console.log('handleChangeAnnotation', i, annotationType, value);

    const { allNotesAnnotations, noteId } = this.state;

    const allNotesAnnotations_NEW = {
      ...allNotesAnnotations,
      [noteId]: allNotesAnnotations[noteId].map((a, j) => i !== j
        ? a
        : {
          ...a,
          [annotationType]: value
        })
    };

    const annotation = document.getElementById(noteId).getElementsByTagName('foreignObject')[0].getElementsByTagName('div')[0];
    const corrected = hasBeenModified(allNotesAnnotations_NEW[noteId]);
    if (corrected) {
      annotation.setAttribute('class', 'correctedAnnotation');
      annotation.innerHTML = makeAnnotationString(this.state.analysis[noteId][0], allNotesAnnotations_NEW[noteId][0], this.state.analysis[noteId].length);
    }
    else {
      annotation.setAttribute('class', 'annotation');
      annotation.innerHTML = makeAnnotationString(this.state.analysis[noteId][0], null, this.state.analysis[noteId].length);
    }

    // Update state

    const new_state = {
      ...this.state,
      allNotesAnnotations: allNotesAnnotations_NEW
    };

    this.setState(new_state);

    save(this.meiUserPath, new_state);
  };

  handleChangeRoot = (offset, value) => {
    console.log('handleChangeRoot', offset, value);

    const correctedOffsets = { ...this.state.correctedOffsets };
    correctedOffsets[offset] = value;

    const new_state = {
      ...this.state,
      correctedOffsets
    };

    this.setState(new_state);

    save(this.meiUserPath, new_state);
  }

  handleClickExportButton = e => {
    toXML(
      this.analysisXML,
      this.state.allNotesAnnotations,
      this.state.correctedOffsets
    );
  };

  // onKeyPressVerovio = e => {
  //   // TODO prev, next
  //   const page = parseInt(e.key, 10);
  //   if ([1, 2, 3, 4, 5, 6, 7, 8, 9].indexOf(page) === -1) return;
  //   this.setState({
  //     score: tk.renderPage(page, {})
  //   })
  // }

  setAllAnnotations = (type, value) => {
    (async () => {
      const n = this.state.allNotesAnnotations[this.state.noteId].length;
      for (let i = 0; i < n; i++) {
        this.handleChangeAnnotation(i, type, value);
        await sleep(250);
      }
    })();
  }

  setAllRoots = value => {
    (async () => {
      const offsets = this.state.allNotesAnnotations[this.state.noteId].map(_ => _[OFFSET]);
      for (let i = 0; i < offsets.length; i++) {
        this.handleChangeRoot(offsets[i], value);
        await sleep(250);
      }
    })();
  }

  render() {
    const noteId = this.state.noteId;

    return (
      <div className="app">
        <div className="hud">
          {this.state.error && <div className="error">⚠</div>}
          <button className="export" type="button" onClick={this.handleClickExportButton}>
            XML
          </button>
          {!this.state.noteId && <div className="selection-message">Click on a note…</div>}
          {this.state.noteId && <div className="selection">
            <span>{`Note ID: ${this.state.noteId}`}</span>
          </div>}
          {this.state.noteId && <div className="annotations">
            <table>
              <tbody>
                <tr>
                  {this.state.analysis[noteId]
                    && this.state.analysis[noteId].map((a, i) => <td key={`${noteId}___a___${i}`}>
                      <span>{
                        a[ANNOTATION_TYPE_PITCHSUBTYPE]
                          ? `${a[ANNOTATION_TYPE_PITCHTYPE]}${PT_PST_SEP}${a[ANNOTATION_TYPE_PITCHSUBTYPE]}`
                          : a[ANNOTATION_TYPE_PITCHTYPE]
                      }</span>
                    </td>)}
                </tr>
                <tr>
                  {this.state.allNotesAnnotations[this.state.noteId]
                    && this.state.allNotesAnnotations[this.state.noteId].map((a, i) => {
                      return <td key={`${noteId}___ca___${i}`}>
                        <input
                          value={a[ANNOTATION_TYPE_PITCHTYPE]}
                          key={`${noteId}___${i}___${ANNOTATION_TYPE_PITCHTYPE}`}
                          onChange={e => this.handleChangeAnnotation(i, ANNOTATION_TYPE_PITCHTYPE, e.target.value)}
                          onDoubleClick={e => this.setAllAnnotations(ANNOTATION_TYPE_PITCHTYPE, e.target.value)}
                          type="text" />
                        <input
                          value={a[ANNOTATION_TYPE_PITCHSUBTYPE]}
                          key={`${noteId}___${i}___${ANNOTATION_TYPE_PITCHSUBTYPE}`}
                          onChange={e => this.handleChangeAnnotation(i, ANNOTATION_TYPE_PITCHSUBTYPE, e.target.value)}
                          onDoubleClick={e => this.setAllAnnotations(ANNOTATION_TYPE_PITCHSUBTYPE, e.target.value)}
                          type="text" />
                      </td>
                    })}
                </tr>
                <tr>
                  {this.state.offsets
                    && this.state.allNotesAnnotations[this.state.noteId]
                    && this.state.allNotesAnnotations[this.state.noteId].map((a, i) => {
                      return <td key={`${noteId}___offset___${i}`}>
                        <span>{`${a[OFFSET]} • ${this.state.offsets[a[OFFSET]]} • `}</span>
                        <input
                          className='root'
                          value={this.state.correctedOffsets[a[OFFSET]]}
                          key={`${noteId}___${i}___${OFFSET}`}
                          maxLength='3'
                          onChange={e => this.handleChangeRoot(a[OFFSET], e.target.value)}
                          onDoubleClick={e => this.setAllRoots(e.target.value)}
                          type="text"
                        >
                        </input>
                      </td>
                    })}
                </tr>
              </tbody>
            </table>
          </div>
          }
        </div>
        <div
          className="verovio"
          dangerouslySetInnerHTML={{
            __html: this.state.score
          }}
          onClick={this.handleClick}
          // onKeyPress={this.onKeyPressVerovio}
          tabIndex="0"
        />
      </div>
    );
  }
}

export default App;