// Shared state: every variable that more than one module reads or writes lives on `S`.

export const S = {
  // Session audio graph
  audioCtx: null, stream: null,
  clickBus: null, recDest: null, clickVolume: 0.8,
  // Transport
  running: false, paused: false, bpm: 50, subdivisions: 1,
  scheduledBeats: [], nextBeatTime: 0, beatIndex: 0,
  animId: null,
  pendingTransition: null, stopPending: false,
  exerciseStartT: null, exercisePausedSec: 0, // playing time for the "Stop after N minutes" limit (count-ins excluded)
  takeInfo: null, // date, time, id and the settings of the take being recorded (for the CSV log)
  sessionId: 0, // bumped on every start; timers check it so they never touch a later session
  clickMode: 'quarters', // 'quarters' | 'b13' | 'b24' | 'downbeat' | 'all' | 'vanish'
  vanishStage: 0, exBarNo: 0, vanishStageStartBar: 0, // exBarNo: exercise bars started so far
  countInBeatsLeft: 0, countInBeatsTotal: 0, inCountIn: false, roundCountIn: false, // roundCountIn: count-in at a new tempo between rounds
  // Mode: manual subdivision or auto pyramid
  autoMode: false,
  PYRAMID_SEQ: [1, 2, 3, 4, 3, 2, 1], // rebuilt from the selected steps (see buildPyramidSeq)
  pyramidStepIdx: 0, barsPerStep: 2, ticksSinceStepStart: 0, roundsDone: 0,
  sysLatencySec: null, // output latency reported by the audio system (+ a small input allowance), measured at Start
  ciClickHeard: false, // set during the count-in when the click pitch shows up in the mic signal
  // Mic test (level meter only)
  micPreviewOn: false,
  // Recording & playback
  mediaRecorder: null, recChunks: [], recordedBlob: null,
  pbRunning: false,
  pbPos: 0,            // playback position (seconds into the recording) — kept across pause
  recStartAudioTime: 0, recBuffer: null, recShift: 0,
  // Pausing stops the recorder but not the audio clock: the recording is shorter than the
  // session by the time spent paused, so logged tick times have that time taken off.
  recPausedSec: 0, pausedAt: 0, recSeg: 0, // recSeg: recording segment, +1 after every resume
  beatLog: [], recBeats: [], // every scheduled tick while recording: {t, q (quarter?), bar, sub}
  viewStart: 0, viewLen: 8,  // visible window of the waveform, seconds
  waveGain: 16,                // vertical zoom of the waveform (soft guitar on a laptop mic needs it)
  // Input level meter, and whether the input heard the click during the count-in
  sessionAnalyser: null, sessionFd: null,
  ciHeardTimes: [], // click times at which the pitch was seen (two different clicks are required)
  outputId: '', // chosen output device
  // Grid placement and analysis of the recording
  recRuler: 0, // ruler shift applied to the grid (see clickRulerShift)
  recOdf: null, // cached onset function of the recording (also reused by the analysis)
  anaResult: null,
  driftView: null, // {start, len} in notes, or null = whole take
};

export const SUB_WORD = { 1: 'quarter', 2: 'eighth', 3: 'triplet', 4: 'sixteenth' };
export const POS_WORD = { 1: ['1'], 2: ['1', '+'], 3: ['1', 'trip', 'let'], 4: ['1', 'e', '+', 'a'] };
