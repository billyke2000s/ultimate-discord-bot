package dev.obskyra.loudness;

import com.sedmelluq.discord.lavaplayer.filter.FloatPcmAudioFilter;

/**
 * Streaming loudness leveler with ITU BS.1770 K-weighting, a 3-second loudness
 * estimate, gated silence and a per-frame peak ceiling. It aims for roughly
 * -18 LUFS without preprocessing an entire song or recording any audio.
 *
 * This is real-time loudness matching, not two-pass integrated track analysis.
 * Very short intros and highly dynamic songs can still vary; boosting is capped
 * when doing more would clip. The listener's Discord volume remains independent.
 */
public final class LoudnessLeveler implements FloatPcmAudioFilter {
    private static final double TARGET_LUFS = -18.0;
    private static final double TARGET_ENERGY = Math.pow(10.0, (TARGET_LUFS + 0.691) / 10.0);
    private static final double GATE_ENERGY = Math.pow(10.0, (-60.0 + 0.691) / 10.0);
    private static final double CEILING = 0.95;
    private static final double MAX_GAIN = 3.16; // about +10 dB; avoid boosting noise
    private static final double MIN_GAIN = 0.25; // -12 dB

    private final FloatPcmAudioFilter downstream;
    private final int channelCount;
    private final int sampleRate;
    private final Biquad[] shelf;
    private final Biquad[] highPass;

    private double energy = TARGET_ENERGY;
    private double gain = 1.0;

    public LoudnessLeveler(FloatPcmAudioFilter downstream, int channelCount, int sampleRate) {
        if (channelCount < 1 || sampleRate < 8000) {
            throw new IllegalArgumentException("Invalid audio format");
        }
        this.downstream = downstream;
        this.channelCount = channelCount;
        this.sampleRate = sampleRate;
        this.shelf = new Biquad[channelCount];
        this.highPass = new Biquad[channelCount];
        for (int c = 0; c < channelCount; c++) {
            // These are the BS.1770 48 kHz K-weighting coefficients. Discord
            // output is 48 kHz; for other rates, do not apply 48 kHz EQ blindly.
            shelf[c] = sampleRate == 48000
                ? new Biquad(1.53512485958697, -2.69169618940638, 1.19839281085285,
                    -1.69065929318241, 0.73248077421585)
                : Biquad.identity();
            highPass[c] = sampleRate == 48000
                ? new Biquad(1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)
                : Biquad.identity();
        }
    }

    @Override
    public void process(float[][] input, int offset, int length) throws InterruptedException {
        if (length <= 0) {
            downstream.process(input, offset, length);
            return;
        }

        double power = 0.0;
        double peak = 0.0;
        // Use K-weighted power for perceived loudness, but measure peak from
        // the original PCM to prevent clipping after makeup gain.
        for (int c = 0; c < channelCount; c++) {
            float[] samples = input[c];
            for (int i = offset, end = offset + length; i < end; i++) {
                double sample = samples[i];
                peak = Math.max(peak, Math.abs(sample));
                double weighted = highPass[c].apply(shelf[c].apply(sample));
                power += weighted * weighted;
            }
        }

        double blockEnergy = power / ((double) length * channelCount);
        if (blockEnergy > GATE_ENERGY) {
            // Smooth the loudness estimate over seconds, not samples. Gating
            // prevents quiet gaps from making the next sound explode.
            double alpha = Math.exp(-(double) length / (sampleRate * 3.0));
            energy = alpha * energy + (1.0 - alpha) * blockEnergy;
            double desired = Math.sqrt(TARGET_ENERGY / Math.max(energy, 1e-12));
            desired = Math.max(MIN_GAIN, Math.min(MAX_GAIN, desired));

            // Fast down, slow up. This avoids sudden jumps and loud intros.
            double seconds = desired < gain ? 0.15 : 2.0;
            double smooth = Math.exp(-(double) length / (sampleRate * seconds));
            gain = smooth * gain + (1.0 - smooth) * desired;
        }

        // Transparent gain adjustment where possible; peak safety when boosting
        // a quiet track takes priority over reaching the target precisely.
        double effective = peak > 0 ? Math.min(gain, CEILING / peak) : gain;
        for (int c = 0; c < channelCount; c++) {
            float[] samples = input[c];
            for (int i = offset, end = offset + length; i < end; i++) {
                samples[i] = (float) (samples[i] * effective);
            }
        }
        downstream.process(input, offset, length);
    }

    @Override
    public void seekPerformed(long requestedTime, long providedTime) {
        energy = TARGET_ENERGY;
        gain = 1.0;
        for (int c = 0; c < channelCount; c++) {
            shelf[c].reset();
            highPass[c].reset();
        }
        downstream.seekPerformed(requestedTime, providedTime);
    }

    @Override
    public void flush() throws InterruptedException {
        downstream.flush();
    }

    @Override
    public void close() {
        downstream.close();
    }

    private static final class Biquad {
        private final double b0, b1, b2, a1, a2;
        private double x1, x2, y1, y2;

        private Biquad(double b0, double b1, double b2, double a1, double a2) {
            this.b0 = b0;
            this.b1 = b1;
            this.b2 = b2;
            this.a1 = a1;
            this.a2 = a2;
        }

        static Biquad identity() {
            return new Biquad(1, 0, 0, 0, 0);
        }

        double apply(double x) {
            double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
            return y;
        }

        void reset() {
            x1 = x2 = y1 = y2 = 0;
        }
    }
}
