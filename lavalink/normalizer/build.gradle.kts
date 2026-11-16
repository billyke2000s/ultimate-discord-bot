plugins {
    java
    alias(libs.plugins.lavalink)
}

group = "dev.obskyra"
version = "0.1.0"

lavalinkPlugin {
    name = "obskyra-loudness"
    apiVersion = libs.versions.lavalink.api
    serverVersion = libs.versions.lavalink.server
}

java {
    toolchain { languageVersion = JavaLanguageVersion.of(17) }
}

tasks.compileJava {
    options.encoding = "UTF-8"
}
