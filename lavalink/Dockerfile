# Compile the lightweight normalizer separately from the running Lavalink image.
# The runtime still uses the same pinned Lavalink version as before.
FROM gradle:8.14-jdk21 AS loudness-build
WORKDIR /plugin
COPY normalizer/ ./
RUN gradle --no-daemon --console=plain build

FROM ghcr.io/lavalink-devs/lavalink:4.2.2-alpine
COPY --from=loudness-build /plugin/build/libs/obskyra-loudness-0.1.0.jar /opt/Lavalink/plugins/obskyra-loudness.jar
