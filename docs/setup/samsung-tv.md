# Install KROMA on a Samsung TV

A Samsung TV installs apps from outside its store only in developer mode, sent
from a computer on the same network, and signed with a certificate that Samsung
issues for that one TV. This guide turns on developer mode, then installs
KROMA with its own installer, which also gets the certificate. The first TV
takes about 10 minutes. The next one takes two.

## Before you begin

- A Samsung smart TV from 2017 or later.
- A Mac or a Linux computer on the same network as the TV, with
  [Node.js](https://nodejs.org) 22 or later. `node --version` prints the
  version. On Windows, follow
  [Optional: install with Tizen Studio](#optional-install-with-tizen-studio)
  instead.
- A Samsung account, the same kind you use on the TV. It is free.
- The address of your computer on the network, such as `192.168.1.20`. On a
  Mac, it is in **System Settings** > **Wi-Fi** > **Details**. On Linux, run
  `hostname -I`. The installer also shows it.

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

## Install KROMA

The installer asks its questions in English. Use the arrow keys to move and
Enter to answer.

1. In a terminal on your computer, start the installer:

   ```bash
   npx @kromatv/installer
   ```

   The first time, `npx` asks to download the installer. Type `y`, then press
   Enter. The installer shows the KROMA name and a short help. To stop it at
   any time, press Ctrl+C.

2. At **Which version of KROMA?**, choose **Stable**.
3. At **Which kind of TV?**, choose **Samsung**.

   The installer repeats the steps for the TV, with the address of your
   computer. You already did them in
   [Turn on developer mode on the TV](#turn-on-developer-mode-on-the-tv).

4. At **Which TVs get KROMA?**, wait for your TV to appear.

   The installer looks for Samsung TVs on your network. A TV in developer mode
   shows **ready** and is already ticked. Press Space to tick or untick a TV.

5. Press Enter to install.

   The first time on a TV, the installer opens Samsung's sign-in page in your
   browser, to ask Samsung for the certificate of your TV.

6. In the browser, sign in with your Samsung account.

   The browser shows **Signed in**. The installer downloads the latest KROMA
   for Samsung, signs it with the certificate, sends it to the TV and starts
   it.

KROMA appears in **Apps** on the TV. Follow
[Connect the TV to your server](tv.md#connect-the-tv-to-your-server).

The certificate is in the `.kroma/certificates/samsung` folder of your home
folder. Samsung makes it valid for one year. Keep that folder: an update of
KROMA must be signed with the same certificate, or the TV refuses it. To add a
second TV, run the installer again, tick that TV, and sign in again.

## Update KROMA

Update KROMA on every TV that this computer installed it on:

```bash
npx @kromatv/installer update
```

The installer asks nothing. It installs the latest version, signed with the
same certificate. The TV keeps your server address and your sign-in.

## Optional: install with Tizen Studio

Tizen Studio is Samsung's own development tool. Use it on Windows, where
KROMA's installer does not run. It replaces
[Install KROMA](#install-kroma) and [Update KROMA](#update-kroma) above. You
also need the KROMA file for Samsung, `KROMA-tizen-VERSION.wgt`, from
[kroma.tv/download](https://kroma.tv/download) or from the
[releases](https://github.com/kromatv/kroma/releases), and the address of
your TV, in **Settings** > **General** > **Network** > **Network Status** >
**IP Settings** on the TV.

### Install Samsung's tools

Samsung's command-line tools, `tizen` and `sdb`, come with Tizen Studio.

1. Download Tizen Studio from Samsung's
   [Installing TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
   page and install it.
2. In the **Package Manager** that opens at the end, go to
   **Extension SDK** and install **TV Extensions** and
   **Samsung Certificate Extension**.

   Samsung requires Samsung Certificate Extension 2.0.74 or later since
   September 2025. Older versions cannot create certificates.

### Connect the computer to the TV

1. In Tizen Studio, open **Tools** > **Device Manager**.
2. Select **Remote Device Manager**, then **+**.
3. Enter a name and the TV's address, keep port `26101`, then select **Add**.
4. Turn on the switch next to the TV.

The TV appears in the device list, with a name such as `UE55AU7172`.

### Create the certificate in Tizen Studio

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

### Sign and install KROMA

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

### Update with Tizen Studio

Install the new `.wgt` the same way, signed with the same profile. The TV keeps
your server address and your sign-in.

## Troubleshooting

### The TV does not appear in the installer

Check that **Developer mode** is written at the top of **Apps** on the TV, and
that the TV and the computer are on the same network. If the TV still does not
appear, install on it by its address:

```bash
npx @kromatv/installer install 192.168.1.62
```

Replace `192.168.1.62` with the address of your TV. It is in **Settings** >
**General** > **Network** > **Network Status** > **IP Settings** on the TV.

### `Invalid certificate chain with certificate in signature`

The package is not signed with a certificate made for this TV. Ask Samsung
for the certificate of this TV again, then install again:

```bash
npx @kromatv/installer certificate 192.168.1.62
```

Replace `192.168.1.62` with the address of your TV.

With Tizen Studio, this also happens with the `.wgt` as downloaded, or with a
profile whose distributor certificate does not list the TV. Sign it again with
your Samsung profile, as in [Sign and install KROMA](#sign-and-install-kroma).

### `Author certificate not match`

A KROMA signed with another certificate is already on the TV. This happens
when KROMA was installed with Tizen Studio, or when you create a new
certificate after KROMA was installed. Remove KROMA: in
**Apps**, hold the select button on the KROMA tile, then choose **Delete**.
Install again. The TV asks for your server and your sign-in again.

### `nobody signed in to Samsung within five minutes`

Samsung sends the sign-in to the computer that runs the installer. The sign-in
page must be open in a browser on that same computer. Run the command again,
and sign in within five minutes.

### The computer cannot connect to the TV

Developer mode accepts one computer: the one whose address you entered. Check
that the address in the TV's **Developer mode** window is your computer's
current address, and restart the TV after you change it.

### KROMA disappeared from the TV

A firmware update of the TV can remove apps installed in developer mode.
Install KROMA again, with the same certificate.

### The installer says the TV did not permit the install

Some TVs ask for permission once per certificate. In Tizen Studio's
**Device Manager**, right-click the TV and select
**Permit to install applications**, then install again.
