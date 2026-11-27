package com.livekit.reactnative.audio.processing;

import java.nio.ByteBuffer;
import livekit.org.webrtc.ExternalAudioProcessingFactory;

/** Optional microphone processing for a host app. Keep the instance passed to SDK setup. */
public final class CaptureProcessing implements ExternalAudioProcessingFactory.AudioProcessing {
    private ExternalAudioProcessingFactory.AudioProcessing processor;
    private int sampleRate;
    private int channels;

    /** Installs or replaces the processor. Pass null on call teardown. */
    public synchronized void setProcessor(ExternalAudioProcessingFactory.AudioProcessing next) {
        if (next == processor) return;
        if (next != null && sampleRate > 0) {
            next.initialize(sampleRate, channels);
        }
        processor = next;
    }

    @Override
    public synchronized void initialize(int sampleRateHz, int numChannels) {
        sampleRate = sampleRateHz;
        channels = numChannels;
        if (processor != null) processor.initialize(sampleRateHz, numChannels);
    }

    @Override
    public synchronized void reset(int newRate) {
        sampleRate = newRate;
        if (processor != null) processor.reset(newRate);
    }

    @Override
    public synchronized void process(int bands, int frames, ByteBuffer buffer) {
        if (processor != null) processor.process(bands, frames, buffer);
    }
}
