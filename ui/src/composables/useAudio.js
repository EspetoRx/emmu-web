import { ref } from "vue";

const AUDIO_BATCH_SECONDS = 0.03;
const MAX_SCHEDULED_AUDIO_SECONDS = 0.1;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function useAudio({ onAudioError, onClearAudioError } = {}) {
  const audioVolume = ref(0.7);
  const showAudioControls = ref(false);
  const audioErrorMessage = ref("");

  let audioContext = null;
  let audioGainNode = null;
  let audioWorkletNode = null;
  let audioWorkletReady = null;
  let audioWorkletUnavailable = false;
  let nextAudioTime = null;
  let pendingAudioChunks = [];
  let pendingAudioFrames = 0;
  let pendingAudioSampleRate = 0;
  let pendingAudioChannels = 0;
  const scheduledAudioSources = new Set();

  function reportAudioError(error) {
    const message = `Áudio indisponível: ${errorText(error)}`;
    audioErrorMessage.value = message;
    onAudioError?.(message);
  }

  function clearAudioError() {
    audioErrorMessage.value = "";
    onClearAudioError?.();
  }

  function notifyPausedAudio() {
    if (!audioErrorMessage.value) {
      const message = "O áudio foi pausado pelo navegador. Ajuste o volume para reativá-lo.";
      audioErrorMessage.value = message;
      onAudioError?.(message);
    }
  }

  function initializeAudio() {
    if (!audioContext) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Este navegador não oferece suporte à reprodução de áudio.");
      }
      audioContext = new AudioContextConstructor();
      audioGainNode = audioContext.createGain();
      audioGainNode.gain.value = audioVolume.value;
      audioGainNode.connect(audioContext.destination);
    }

    return (async () => {
      if (audioContext.state !== "running" && audioContext.state !== "closed") {
        await audioContext.resume();
      }
      if (
        !audioWorkletNode &&
        !audioWorkletUnavailable &&
        audioContext.audioWorklet &&
        typeof AudioWorkletNode === "function"
      ) {
        try {
          audioWorkletReady ??= audioContext.audioWorklet.addModule(
            new URL("../workers/audio-worklet.js", import.meta.url),
          );
          await audioWorkletReady;
          if (!audioWorkletNode) {
            audioWorkletNode = new AudioWorkletNode(audioContext, "emmu-audio", {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [2],
              channelCount: 2,
              channelCountMode: "explicit",
            });
            audioWorkletNode.connect(audioGainNode);
            audioWorkletNode.addEventListener("processorerror", () => {
              reportAudioError(new Error("O processador de áudio foi interrompido."));
            });
          }
        } catch {
          audioWorkletUnavailable = true;
          audioWorkletReady = null;
        }
      }
    })();
  }

  function updateAudioGain() {
    if (!audioGainNode || !audioContext) return;
    audioGainNode.gain.setTargetAtTime(audioVolume.value, audioContext.currentTime, 0.015);
  }

  function activateAudio() {
    clearAudioError();
    try {
      void initializeAudio().catch(reportAudioError);
    } catch (error) {
      reportAudioError(error);
    }
  }

  function setAudioVolume(volume) {
    audioVolume.value = Math.min(1, Math.max(0, volume));
    updateAudioGain();
    activateAudio();
  }

  function flushAudioBatch() {
    const sampleCount = pendingAudioFrames;
    if (!sampleCount) return;

    const channels = pendingAudioChannels;
    const audioSamples = new Float32Array(sampleCount * channels);
    let offset = 0;
    for (const chunk of pendingAudioChunks) {
      audioSamples.set(chunk.samples, offset);
      offset += chunk.samples.length;
    }
    const sampleRate = pendingAudioSampleRate;
    pendingAudioChunks = [];
    pendingAudioFrames = 0;
    pendingAudioSampleRate = 0;
    pendingAudioChannels = 0;

    if (!audioContext || !audioGainNode) return;
    if (audioContext.state !== "running") {
      notifyPausedAudio();
      return;
    }

    const buffer = audioContext.createBuffer(channels, sampleCount, sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const output = buffer.getChannelData(channel);
      for (let index = 0; index < sampleCount; index += 1) {
        output[index] = audioSamples[index * channels + channel];
      }
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioGainNode);
    source.onended = () => {
      scheduledAudioSources.delete(source);
      source.disconnect();
    };
    if (
      nextAudioTime !== null &&
      nextAudioTime - audioContext.currentTime > MAX_SCHEDULED_AUDIO_SECONDS
    ) {
      for (const scheduledSource of scheduledAudioSources) {
        scheduledSource.stop();
        scheduledSource.disconnect();
      }
      scheduledAudioSources.clear();
      nextAudioTime = null;
    }
    const startAt = Math.max(
      nextAudioTime ?? audioContext.currentTime + 0.02,
      audioContext.currentTime,
    );
    source.start(startAt);
    nextAudioTime = startAt + buffer.duration;
    scheduledAudioSources.add(source);
  }

  function queueAudioFrame({ audioSamples, audioSampleRate, audioChannels = 2 }) {
    if (!audioSamples?.length) return;
    if (
      !audioSampleRate ||
      !audioChannels ||
      audioChannels > 2 ||
      audioSamples.length % audioChannels !== 0
    ) {
      throw new Error("O núcleo retornou um bloco de áudio inválido.");
    }
    if (!audioContext || !audioGainNode) return;
    if (audioContext.state !== "running") {
      notifyPausedAudio();
      return;
    }

    let samples = audioSamples;
    if (!(samples instanceof Float32Array)) {
      samples = new Float32Array(audioSamples.length);
      for (let index = 0; index < audioSamples.length; index += 1) {
        samples[index] =
          audioSamples instanceof Int16Array
            ? audioSamples[index] / 32768
            : audioSamples[index];
      }
    }

    if (audioWorkletNode) {
      audioWorkletNode.port.postMessage(
        { samples, sampleRate: audioSampleRate, channels: audioChannels },
        [samples.buffer],
      );
      return;
    }

    if (
      pendingAudioChunks.length &&
      (pendingAudioSampleRate !== audioSampleRate || pendingAudioChannels !== audioChannels)
    ) {
      flushAudioBatch();
    }
    pendingAudioSampleRate = audioSampleRate;
    pendingAudioChannels = audioChannels;
    pendingAudioChunks.push({ samples });
    pendingAudioFrames += samples.length / audioChannels;

    if (pendingAudioFrames >= audioSampleRate * AUDIO_BATCH_SECONDS) {
      flushAudioBatch();
    }
  }

  function stopAudioPlayback() {
    for (const source of scheduledAudioSources) {
      source.stop();
      source.disconnect();
    }
    scheduledAudioSources.clear();
    nextAudioTime = null;
    pendingAudioChunks = [];
    pendingAudioFrames = 0;
    pendingAudioSampleRate = 0;
    pendingAudioChannels = 0;
    audioWorkletNode?.port.postMessage({ type: "reset" });
  }

  function closeAudioContext() {
    stopAudioPlayback();
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }

  return {
    audioVolume,
    showAudioControls,
    audioErrorMessage,
    initializeAudio,
    reportAudioError,
    clearAudioError,
    setAudioVolume,
    queueAudioFrame,
    stopAudioPlayback,
    closeAudioContext,
  };
}
