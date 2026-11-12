# Install KROMA on a computer

KROMA has an app for macOS, Windows and Linux, including the Steam Deck. It
shows the same screens as the TV app and updates itself. You can also skip the
app: every KROMA server serves a web version at `http://SERVER_IP:4040`.

Download the installer for your system from
[kroma.tv/download](https://kroma.tv/download). The installers are not signed
by Apple or Microsoft yet, so each system asks you to confirm the first time.

## macOS

There are two files. Choose the one for your Mac's processor: in the Apple
menu, select **About This Mac**. A **Chip** line names Apple silicon, a
**Processor** line names Intel.

| Your Mac | File |
| --- | --- |
| Apple silicon (M1 and later) | `KROMA_VERSION_aarch64.dmg` |
| Intel | `KROMA_VERSION_x64.dmg` |

1. Open the `.dmg` file and drag **KROMA** into **Applications**.
2. Open KROMA from **Applications**. macOS refuses to open it the first time.
3. Open **System Settings** > **Privacy & Security**, scroll down to the
   message about KROMA, and select **Open Anyway**.
4. Confirm with **Open**, and enter your password if asked.

macOS remembers the choice. Updates install without asking again.

If you prefer the terminal, this command does steps 2 to 4 at once:

```bash
xattr -dr com.apple.quarantine /Applications/KROMA.app
```

## Windows

There are two files. Use `KROMA_VERSION_x64-setup.exe` unless your IT department
installs software for you, in which case they want the `.msi`.

1. Open the installer.
2. When Windows shows **Windows protected your PC**, select **More info**, then
   **Run anyway**.
3. Follow the installer.

KROMA updates itself from then on.

If Windows refuses with no **Run anyway** button, **Smart App Control** is on.
It blocks every unsigned app and has no exception for one app. Use the web
version in your browser instead.

## Linux

- On Debian and Ubuntu, install `KROMA_VERSION_amd64.deb`, for example with
  `sudo apt install ./KROMA_*_amd64.deb`.
- On any other distribution, use `KROMA_VERSION_amd64.AppImage`. Make it
  executable, then open it:

  ```bash
  chmod +x KROMA_*.AppImage
  ./KROMA_*.AppImage
  ```

KROMA plays video with mpv, which is inside the app: there is nothing else to
install.

## Steam Deck

1. Switch to **Desktop Mode**.
2. Download `KROMA_VERSION_amd64.AppImage`, then make it executable: right-click
   it, select **Properties** > **Permissions**, and tick
   **Is executable**.
3. In Steam, select **Add a Non-Steam Game**, then **Browse**, and pick the
   AppImage.
4. Go back to **Game Mode** and start KROMA from your library.
5. In the controller settings for KROMA, choose the **Gamepad** layout.

| Control | Action |
| --- | --- |
| D-pad or left stick | Move |
| A | Select |
| B | Back |
| X | Play or pause |
| L1, L2 | Seek back |
| R1, R2 | Seek forward |

## Connect to your server

When KROMA opens, it looks for a server on your network. If it finds none,
enter the server's address, for example `http://192.168.1.50:4040`, then sign
in with your account.

## Web browser

Nothing to install: open `http://SERVER_IP:4040` in Chrome, Edge, Firefox or
Safari. The server serves the web app itself. Replace `SERVER_IP` with your
server's address.
