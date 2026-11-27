package org.dtelecom.ci;

import com.livekit.reactnative.audio.processing.CaptureProcessing;
import java.nio.ByteBuffer;
import livekit.org.webrtc.ExternalAudioProcessingFactory;
import org.junit.Test;
import static org.junit.Assert.*;

public class CaptureProcessingTest {
    private static final class Probe implements ExternalAudioProcessingFactory.AudioProcessing {
        int initializations, resets, frames, rate, channels;
        ByteBuffer lastFrame;

        @Override public void initialize(int rate, int channels) {
            initializations++;
            this.rate = rate;
            this.channels = channels;
        }

        @Override public void reset(int rate) {
            resets++;
            this.rate = rate;
        }

        @Override public void process(int bands, int frames, ByteBuffer buffer) {
            assertEquals(1, bands);
            assertEquals(160, frames);
            this.frames++;
            lastFrame = buffer;
        }
    }

    @Test public void activeCaptureCanReplaceAndClearItsProcessor() {
        CaptureProcessing capture = new CaptureProcessing();
        capture.initialize(48000, 2);
        Probe first = new Probe();
        capture.setProcessor(first);
        capture.setProcessor(first);
        assertEquals(1, first.initializations);
        assertEquals(48000, first.rate);
        assertEquals(2, first.channels);

        ByteBuffer frame = ByteBuffer.allocateDirect(160 * 2 * Float.BYTES);
        capture.process(1, 160, frame);
        assertSame(frame, first.lastFrame);
        capture.reset(16000);
        assertEquals(1, first.resets);
        assertEquals(16000, first.rate);

        Probe second = new Probe();
        capture.setProcessor(second);
        assertEquals(1, second.initializations);
        assertEquals(16000, second.rate);
        assertEquals(2, second.channels);
        capture.process(1, 160, frame);
        assertEquals(1, first.frames);
        assertSame(frame, second.lastFrame);

        capture.setProcessor(null);
        capture.reset(32000);
        capture.process(1, 160, frame);
        assertEquals(0, second.resets);
        assertEquals(1, second.frames);
    }
}
