import Tone from 'tone';
import { Note, Distance } from 'tonal';
import fetchSpecFile from '@generative-music/samples.generative.fm';

const NOTES = ['C2', 'E2', 'G2', 'C3', 'E3', 'G3', 'C4', 'E4', 'G4'];

const findClosest = (samplesByNote, note) => {
  const noteMidi = Note.midi(note);
  const maxInterval = 96;
  let interval = 0;
  while (interval <= maxInterval) {
    const higherNote = Note.fromMidi(noteMidi + interval);
    if (samplesByNote[higherNote]) {
      return higherNote;
    }
    const lowerNote = Note.fromMidi(noteMidi - interval);
    if (samplesByNote[lowerNote]) {
      return lowerNote;
    }
    interval += 1;
  }
  return note;
};

const getBuffers = samplesByNote =>
  new Promise(resolve => {
    const buffers = new Tone.Buffers(samplesByNote, {
      onload: () => resolve(buffers),
    });
  });

const makePlayNote = (
  buffers,
  samplesByNote,
  destination,
  opts = {}
) => note => {
  const closestSampledNote = findClosest(samplesByNote, note);
  const difference = Distance.semitones(closestSampledNote, note);
  const buffer = buffers.get(closestSampledNote);
  const pitchShiftSemitones = Math.random() < 1 ? 0 : 12;
  const playbackRate = Tone.intervalToFrequencyRatio(
    difference - pitchShiftSemitones
  );
  const source = new Tone.BufferSource(buffer)
    .set(Object.assign({}, opts, { playbackRate }))
    .connect(destination);
  source.start(`+1`, 0, buffer.duration / playbackRate - (opts.fadeOut || 0));
};

const makePiece = ({
  audioContext,
  destination,
  preferredFormat,
  sampleSource = {},
}) =>
  fetchSpecFile(sampleSource.baseUrl, sampleSource.specFilename).then(
    ({ samples }) => {
      if (Tone.context !== audioContext) {
        Tone.setContext(audioContext);
      }
      const guitarSamples = samples['acoustic-guitar'][preferredFormat];
      const hum1Samples = samples['alex-hum-1'][preferredFormat];
      const hum2Samples = samples['alex-hum-2'][preferredFormat];
      return Promise.all([
        getBuffers(guitarSamples),
        getBuffers(hum1Samples),
        getBuffers(hum2Samples),
        new Tone.Reverb(10).generate(),
      ]).then(([guitarBuffers, hum1Buffers, hum2Buffers, reverb]) => {
        const compressor = new Tone.Compressor().connect(reverb);
        const humVolume = new Tone.Volume(-10).connect(compressor);
        const playGuitar = makePlayNote(
          guitarBuffers,
          guitarSamples,
          compressor
        );
        const playHum1 = makePlayNote(hum1Buffers, hum1Samples, humVolume, {
          fadeIn: 3,
          fadeOut: 3,
          curve: 'linear',
        });
        const playHum2 = makePlayNote(hum2Buffers, hum2Samples, humVolume, {
          fadeIn: 3,
          fadeOut: 3,
          curve: 'linear',
        });
        const lastHumTime = new Map();
        const playHums = note => {
          const now = Date.now();
          if (!lastHumTime.has(note) || now - lastHumTime.get(note) > 30000) {
            [playHum1, playHum2].forEach(playHum => playHum(note));
            lastHumTime.set(note, now);
          }
        };

        reverb.connect(destination);
        reverb.set({ wet: 0.5 });

        NOTES.forEach(note => {
          const play = () => {
            const pc = Note.pc(note);
            Tone.Transport.scheduleOnce(() => {
              const octave = Note.oct(note);
              if (
                (octave === 3 || (octave === 2 && pc === 'G')) &&
                Math.random() < 0.1
              ) {
                playHums(note);
              } else if (Math.random() < 0.1) {
                playHums('E3');
              }
              playGuitar(note);
              play();
            }, `+${(Math.random() * 20 + 5) * (pc === 'E' ? 3 : 1)}`);
          };
          play();
        });
      });
    }
  );

export default makePiece;