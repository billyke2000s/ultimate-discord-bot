package dev.obskyra.loudness;

import com.sedmelluq.discord.lavaplayer.filter.FloatPcmAudioFilter;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

final class LoudnessLevelerTest {
    private static final int SAMPLE_RATE = 48000;
    private static final int FRAME_LENGTH = 960;

    @Test
    void quietSongsAreRaisedAndLoudSongsAreLoweredWithoutClipping() throws InterruptedException {
        double quiet = finalRms(0.10);
        double loud = finalRms(0.70);
        // Both should converge toward the same perceived loudness in steady music.
        assertTrue(quiet > 0.10 / Math.sqrt(2), "quiet track should be amplified");
        assertTrue(loud < 0.70 / Math.sqrt(2), "loud track should be attenuated");
        assertTrue(Math.abs(20 * Math.log10(quiet / loud)) < 4.0,
            "levels should be within roughly 4 dB once settled");
    }

    private static double finalRms(double amplitude) throws InterruptedException {
        float[][] samples = new float[2][FRAME_LENGTH];
        final double[] tailPower = { 0.0 };
        final int[] tailFrames = { 0 };
        FloatPcmAudioFilter downstream = new FloatPcmAudioFilter() {
            @Override public void process(float[][] input, int offset, int length) {
                for (int i = offset; i < offset + length; i++) {
                    for (float[] channel : input) {
                        assertTrue(Math.abs(channel[i]) <= 0.951f, "must not clip");
                        tailPower[0] += channel[i] * channel[i];
                        tailFrames[0]++;
                    }
                }
            }
            @Override public void seekPerformed(long requestedTime, long providedTime) {}
            @Override public void flush() {}
            @Override public void close() {}
        };

        LoudnessLeveler normalizer = new LoudnessLeveler(downstream, 2, SAMPLE_RATE);
        // Let the 3-second estimate settle. Evaluate the final 1 second.
        for (int block = 0; block < 750; block++) {
            for (int i = 0; i < FRAME_LENGTH; i++) {
                double t = ((long) block * FRAME_LENGTH + i) / (double) SAMPLE_RATE;
                float sample = (float) (Math.sin(2 * Math.PI * 1000 * t) * amplitude);
                samples[0][i] = sample;
                samples[1][i] = sample;
            }
            if (block == 700) {
                tailPower[0] = 0;
                tailFrames[0] = 0;
            }
            normalizer.process(samples, 0, FRAME_LENGTH);
        }
        normalizer.close();
        return Math.sqrt(tailPower[0] / tailFrames[0]);
    }
}
