const MAX_QUEUE_SECONDS = 0.4;
const START_QUEUE_SECONDS = 0.08;

// Windowed-sinc resampling. Linear interpolation of 32 kHz NDS audio into a
// 44.1/48 kHz AudioContext leaves strong spectral images that are audible as
// hiss, especially on quiet tracks. A 64-tap Lanczos kernel low-passes those
// images before the rate conversion.
const TAPS = 64;
const HALF_TAPS = TAPS / 2;
const PHASES = 256;

function sinc(x) {
  if (Math.abs(x) < 1e-9) return 1;
  const y = Math.PI * x;
  return Math.sin(y) / y;
}

function buildKernel(inputRate, outputRate) {
  const ratio = inputRate / outputRate;
  const cutoff = Math.min(0.5, 0.5 / ratio);
  const scale = 2 * cutoff;
  const windowWidth = HALF_TAPS;
  const kernel = new Float32Array(PHASES * TAPS);

  for (let phase = 0; phase < PHASES; phase += 1) {
    const t = phase / PHASES;
    let sum = 0;
    for (let tap = 0; tap < TAPS; tap += 1) {
      const offset = tap - (HALF_TAPS - 1);
      const x = scale * (t - offset);
      let value = 0;
      if (Math.abs(x) < windowWidth) {
        value = scale * sinc(x) * sinc(x / windowWidth);
      }
      kernel[phase * TAPS + tap] = value;
      sum += value;
    }
    if (sum !== 0) {
      for (let tap = 0; tap < TAPS; tap += 1) {
        kernel[phase * TAPS + tap] /= sum;
      }
    }
  }
  return kernel;
}

class EmmuAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputRate = 0;
    this.channels = 0;
    this.buffer = null;
    this.capacity = 0;
    this.readFrame = 0;
    this.writeFrame = 0;
    this.queuedFrames = 0;
    this.consumedFrames = 0;
    this.phase = 0;
    this.started = false;
    this.kernel = null;
    this.port.onmessage = ({ data }) => this.receive(data);
  }

  reconfigure(sampleRate, channels) {
    this.inputRate = sampleRate;
    this.channels = channels;
    this.capacity = Math.ceil(sampleRate * MAX_QUEUE_SECONDS) + TAPS + 4;
    this.buffer = new Float32Array(this.capacity * channels);
    this.readFrame = 0;
    this.writeFrame = 0;
    this.queuedFrames = 0;
    this.consumedFrames = 0;
    this.phase = 0;
    this.started = false;
    this.kernel = buildKernel(sampleRate, sampleRateGlobal());
  }

  receive(data) {
    if (data?.type === "reset") {
      this.readFrame = 0;
      this.writeFrame = 0;
      this.queuedFrames = 0;
      this.consumedFrames = 0;
      this.phase = 0;
      this.started = false;
      return;
    }

    const { samples, sampleRate, channels } = data ?? {};
    if (
      !(samples instanceof Float32Array) ||
      !Number.isInteger(sampleRate) ||
      sampleRate <= 0 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 2 ||
      samples.length === 0 ||
      samples.length % channels !== 0
    ) {
      return;
    }

    if (sampleRate !== this.inputRate || channels !== this.channels) {
      this.reconfigure(sampleRate, channels);
    }

    const frameCount = samples.length / channels;
    const startFrame = Math.max(0, frameCount - this.capacity);
    const incomingFrames = frameCount - startFrame;
    const overflow = Math.max(0, this.queuedFrames + incomingFrames - this.capacity);
    if (overflow > 0) {
      this.readFrame = (this.readFrame + overflow) % this.capacity;
      this.queuedFrames -= overflow;
      this.phase = 0;
      this.started = false;
    }

    for (let frame = startFrame; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        this.buffer[this.writeFrame * channels + channel] =
          samples[frame * channels + channel];
      }
      this.writeFrame = (this.writeFrame + 1) % this.capacity;
      this.queuedFrames += 1;
    }
  }

  sampleAt(offset, channel) {
    let limited = offset;
    if (limited < -this.consumedFrames) limited = -this.consumedFrames;
    const index = (this.readFrame + limited + this.capacity) % this.capacity;
    return this.buffer[index * this.channels + channel];
  }

  interpolate(channel, phaseIndex, phase) {
    if (!this.kernel || this.queuedFrames < TAPS + 2) {
      const first = this.sampleAt(0, channel);
      const second = this.sampleAt(1, channel);
      return first + (second - first) * phase;
    }

    let value = 0;
    const base = phaseIndex * TAPS;
    for (let tap = 0; tap < TAPS; tap += 1) {
      const offset = tap - (HALF_TAPS - 1);
      value += this.sampleAt(offset, channel) * this.kernel[base + tap];
    }
    return value;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.length) return true;
    for (const channel of output) channel.fill(0);

    if (!this.buffer || this.queuedFrames < 2) {
      if (this.queuedFrames === 1) this.queuedFrames = 0;
      this.readFrame = this.writeFrame;
      this.consumedFrames = 0;
      this.phase = 0;
      this.started = false;
      return true;
    }
    if (!this.started) {
      if (this.queuedFrames < this.inputRate * START_QUEUE_SECONDS) return true;
      this.started = true;
    }

    const left = output[0];
    const right = output[1] ?? output[0];
    const step = this.inputRate / sampleRate;
    for (let index = 0; index < left.length; index += 1) {
      if (this.queuedFrames < 2) {
        this.readFrame = this.writeFrame;
        this.consumedFrames = 0;
        this.queuedFrames = 0;
        this.phase = 0;
        this.started = false;
        break;
      }

      const phaseIndex = Math.min(
        PHASES - 1,
        Math.floor(this.phase * PHASES),
      );
      left[index] = this.interpolate(0, phaseIndex, this.phase);
      if (right !== left) {
        right[index] = this.channels === 1
          ? left[index]
          : this.interpolate(1, phaseIndex, this.phase);
      }

      this.phase += step;
      const consumedFrames = Math.min(
        Math.floor(this.phase),
        this.queuedFrames - 1,
      );
      if (consumedFrames > 0) {
        this.readFrame = (this.readFrame + consumedFrames) % this.capacity;
        this.queuedFrames -= consumedFrames;
        this.consumedFrames += consumedFrames;
        this.phase -= consumedFrames;
      }
    }
    return true;
  }
}

function sampleRateGlobal() {
  return sampleRate;
}

registerProcessor("emmu-audio", EmmuAudioProcessor);
