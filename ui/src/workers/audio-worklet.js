const MAX_QUEUE_SECONDS = 0.25;
const START_QUEUE_SECONDS = 0.035;

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
    this.phase = 0;
    this.started = false;
    this.port.onmessage = ({ data }) => this.receive(data);
  }

  receive(data) {
    if (data?.type === "reset") {
      this.readFrame = 0;
      this.writeFrame = 0;
      this.queuedFrames = 0;
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
      this.inputRate = sampleRate;
      this.channels = channels;
      this.capacity = Math.ceil(sampleRate * MAX_QUEUE_SECONDS) + 2;
      this.buffer = new Float32Array(this.capacity * channels);
      this.readFrame = 0;
      this.writeFrame = 0;
      this.queuedFrames = 0;
      this.phase = 0;
      this.started = false;
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

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.length) return true;
    for (const channel of output) channel.fill(0);

    if (!this.buffer || this.queuedFrames < 2) {
      if (this.queuedFrames === 1) this.queuedFrames = 0;
      this.readFrame = this.writeFrame;
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
        this.queuedFrames = 0;
        this.phase = 0;
        this.started = false;
        break;
      }

      const nextFrame = (this.readFrame + 1) % this.capacity;
      const offset = this.readFrame * this.channels;
      const nextOffset = nextFrame * this.channels;
      const leftSample = this.buffer[offset];
      const nextLeftSample = this.buffer[nextOffset];
      left[index] = leftSample + (nextLeftSample - leftSample) * this.phase;
      if (right !== left) {
        const rightSample =
          this.channels === 1 ? leftSample : this.buffer[offset + 1];
        const nextRightSample =
          this.channels === 1 ? nextLeftSample : this.buffer[nextOffset + 1];
        right[index] =
          rightSample + (nextRightSample - rightSample) * this.phase;
      }

      this.phase += step;
      const consumedFrames = Math.min(
        Math.floor(this.phase),
        this.queuedFrames - 1,
      );
      if (consumedFrames > 0) {
        this.readFrame = (this.readFrame + consumedFrames) % this.capacity;
        this.queuedFrames -= consumedFrames;
        this.phase -= consumedFrames;
      }
    }
    return true;
  }
}

registerProcessor("emmu-audio", EmmuAudioProcessor);
