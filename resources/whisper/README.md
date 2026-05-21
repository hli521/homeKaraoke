Bundled Whisper runtime layout:

resources/whisper/<platform>/whisper-cli
resources/whisper/<platform>/ggml-small.bin
resources/whisper/lib/*.dylib
resources/whisper/libexec/libggml-*.so

Supported platform folder names:

- darwin-arm64
- darwin-x64
- win-x64
- linux-x64

On Windows, name the binary whisper-cli.exe.

The default bundled model filename is ggml-small.bin.
You can use a different bundled model filename by setting WHISPER_MODEL_NAME.
Environment variables WHISPER_CPP_BIN and WHISPER_MODEL_PATH still override bundled paths.

The macOS Homebrew whisper.cpp build also needs its runtime dylibs and ggml backend plugins.
The Electron app sets GGML_BACKEND_PATH to the matching bundled CPU backend and runs Whisper
with CPU mode by default. Set WHISPER_USE_GPU=1 only when you want to opt into GPU/Metal.
