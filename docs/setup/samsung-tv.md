# Install KROMA on a Samsung TV

A Samsung TV installs apps from outside its store only in developer mode, sent
from a computer on the same network, and signed with a certificate that Samsung
issues for that one TV. This guide does all three. The first TV takes about 30
minutes. The next one takes five.

## Before you begin

- A Samsung smart TV from 2017 or later.
- A Mac, Windows or Linux computer on the same network as the TV.
- A Samsung account, the same kind you use on the TV. It is free.
- The address of your computer on the network, such as `192.168.1.20`. On a
  Mac, it is in **System Settings** > **Wi-Fi** > **Details**. On Windows, run
  `ipconfig`. On Linux, run `hostname -I`.
- The address of your TV, in **Settings** > **General** > **Network** >
  **Network Status** > **IP Settings** on the TV.
- The KROMA file for Samsung, `KROMA-tizen-VERSION.wgt`, from
  [kroma.tv/download](https://kroma.tv/download) or from the
  [releases](https://github.com/kromatv/kroma/releases).

## Turn on developer mode on the TV

1. On the TV, open **Apps**.

   On TVs from 2024 and later, **Apps** is a tab in the bar at the top of the
   home screen.

2. Type `1 2 3 4 5` with the remote.

   If your remote has no number buttons, press the **123** button to show a
   number pad on the screen. On 2024 and later TVs, scroll down to the
   settings at the bottom of **Apps** first, then type the code.

3. In the **Developer mode** window, switch **Developer mode** to **On**.
4. Enter your computer's address as the host PC IP, then select **OK**.
5. Turn the TV off, then on again.

When the TV is back, **Developer mode** is written at the top of the **Apps**
screen. If it is not, unplug the TV for 30 seconds and plug it back in: with
**Instant On** turned on, the remote only puts the TV to sleep.

## Install Samsung's tools on your computer

Samsung's command-line tools, `tizen` and `sdb`, come with Tizen Studio.

1. Download Tizen Studio from Samsung's
   [Installing TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
   page and install it.
2. In the **Package Manager** that opens at the end, go to
   **Extension SDK** and install **TV Extensions** and
   **Samsung Certificate Extension**.

   Samsung requires Samsung Certificate Extension 2.0.74 or later since
   September 2025. Older versions cannot create certificates.

## Connect the computer to the TV

1. In Tizen Studio, open **Tools** > **Device Manager**.
2. Select **Remote Device Manager**, then **+**.
3. Enter a name and the TV's address, keep port `26101`, then select **Add**.
4. Turn on the switch next to the TV.

The TV appears in the device list, with a name such as `UE55AU7172`.

## Create a certificate for your TV

Samsung TVs only install apps signed with a certificate made for that TV.
You create it once, and reuse it for every update.

1. In Tizen Studio, open **Tools** > **Certificate Manager**.
2. Select **+**, then **Samsung**, then **TV**.
3. Enter a profile name, for example `kroma`.
4. Choose **Create a new author certificate**, enter a name and a password,
   and sign in with your Samsung account when the browser opens.
5. For the distributor certificate, keep the default privilege. Check that the
   list of devices shows your TV: Tizen Studio reads its ID, called a DUID,
   from the connected TV. The TV also shows it in **Settings** > **Support** >
   **Contact Samsung**, as **Unique Device ID**.
6. Select **Finish**.

Keep the author certificate and its password. An update of KROMA must be signed
with the same author certificate, or the TV refuses it. To add a second TV
later, edit the profile and add that TV to the distributor certificate.

The official steps, with screenshots, are on Samsung's
[Creating certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
page.

## Install KROMA

The `.wgt` file you downloaded is signed by KROMA. Sign it again with your own
certificate, then send it to the TV.

On macOS or Linux, in a terminal, in the folder where you downloaded the file:

1. Unpack the file and remove its signatures:

   ```bash
   mkdir kroma-tizen
   unzip -q KROMA-tizen-*.wgt -d kroma-tizen
   cd kroma-tizen
   rm -f author-signature.xml signature1.xml signature2.xml
   ```

2. Sign it with your profile:

   ```bash
   ~/tizen-studio/tools/ide/bin/tizen package -t wgt -s kroma -- .
   ```

   Replace `kroma` with the profile name you chose. The command creates
   `KROMA.wgt` in the folder.

3. Install it on the TV:

   ```bash
   ~/tizen-studio/tools/ide/bin/tizen install -n KROMA.wgt -- .
   ```

On Windows, rename the file to `.zip`, extract it to a folder, delete
`author-signature.xml`, `signature1.xml` and `signature2.xml`, then run the
same two `tizen` commands in **Command Prompt** from that folder, with
`C:\tizen-studio\tools\ide\bin\tizen.bat`.

KROMA appears in **Apps** on the TV. Open it, then follow
[Connect the TV to your server](tv.md#connect-the-tv-to-your-server).

## Optional: install with KROMA's TV installer

If you have a copy of the KROMA repository and [Bun](https://bun.sh) on a Mac
or Linux computer, one command finds the TVs on your network, signs the app
with your active Tizen Studio profile and installs it:

```bash
bun install
bun run tv
```

You still turn on developer mode and create the certificate as above. The
installer is described in
[packages/installer](../../packages/installer/README.md).

## Update KROMA

Install the new `.wgt` the same way, signed with the same profile. The TV keeps
your server address and your sign-in.

## Troubleshooting

### `Invalid certificate chain with certificate in signature`

The package is not signed with a certificate made for this TV. This happens
with the `.wgt` as downloaded, or with a profile whose distributor certificate
does not list the TV. Sign it again with your Samsung profile, as in
[Install KROMA](#install-kroma).

### `Author certificate not match`

A KROMA signed with another author certificate is already on the TV. Remove it:
in **Apps**, hold the select button on the KROMA tile, then choose
**Delete**. Install again.

### The computer cannot connect to the TV

Developer mode accepts one computer: the one whose address you entered. Check
that the address in the TV's **Developer mode** window is your computer's
current address, and restart the TV after you change it.

### KROMA disappeared from the TV

A firmware update of the TV can remove apps installed in developer mode.
Install KROMA again, signed with the same profile.

### The installer says the TV did not permit the install

Some TVs ask for permission once per certificate. In Tizen Studio's
**Device Manager**, right-click the TV and select
**Permit to install applications**, then install again.
