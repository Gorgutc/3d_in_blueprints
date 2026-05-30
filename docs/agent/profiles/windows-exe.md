# Windows Executable Profile

Profile id: `windows-exe`.
Status: dormant.

This profile prepares future planning for a Windows executable. It does not
activate a stack, compiler, installer, signing workflow, UI framework, or build
command.

When a future request activates this profile, decide:

- target language and runtime;
- packaging tool and installer format;
- code signing and update strategy;
- Windows version support;
- reproducible build command;
- smoke test command on Windows;
- artifact naming and `DO_NOT_PUSH.md` handling.

Candidate stacks can include Tauri, Electron, Python packagers, .NET, Rust, or
another option selected by the task brief.
