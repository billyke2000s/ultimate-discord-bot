package dev.obskyra.loudness;

import com.sedmelluq.discord.lavaplayer.filter.FloatPcmAudioFilter;
import com.sedmelluq.discord.lavaplayer.format.AudioDataFormat;
import dev.arbjerg.lavalink.api.AudioFilterExtension;
import kotlinx.serialization.json.JsonElement;
import kotlinx.serialization.json.JsonNull;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.springframework.stereotype.Service;

/**
 * Real-time loudness levelling for streamed tracks. Unlike a peak limiter, this
 * can raise quiet material as well as attenuate loud material.
 * No audio is captured from voice chat or sent to a third party.
 */
@Service
public final class LoudnessFilterExtension implements AudioFilterExtension {
    @NotNull
    @Override
    public String getName() {
        return "loudness";
    }

    @Override
    public boolean isEnabled(@NotNull JsonElement data) {
        return !(data instanceof JsonNull);
    }

    @Nullable
    @Override
    public FloatPcmAudioFilter build(
        @NotNull JsonElement data,
        @Nullable AudioDataFormat format,
        @Nullable FloatPcmAudioFilter output
    ) {
        if (format == null || output == null) return null;
        return new LoudnessLeveler(output, format.channelCount, format.sampleRate);
    }
}
