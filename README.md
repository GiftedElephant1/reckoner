# Reckoner

A pocket spreadsheet for iPhone. You type a calculation once, and every number in it becomes a row you can rename and change later, so the same sum is ready the next time you need it. Tips, loan payments, paint for a room, a running total of receipts.

Reckoner is free and has nothing locked: no purchases, no limit on sheets, no ads, no account.

It is modelled on the way [Zolvy](https://www.solutionist.dev/) by Domnic Francis works, and it is an independent app with its own name, code and design. It is not affiliated with Zolvy.

## Put it on your iPhone from a Windows PC

Apple only lets a Mac turn code into an iPhone app. This project gets round that by borrowing one: GitHub runs a Mac in the cloud that builds the app for you, and a free Windows program called Sideloadly installs the result on your phone. You do not need a Mac or a paid Apple developer account.

You need:

- an iPhone with iOS 15 or newer, and its cable
- a Windows PC
- a free [GitHub](https://github.com) account
- an Apple ID

There are three parts. The first takes about ten minutes, most of it waiting.

### Part 1. Let GitHub build the app

1. Sign in to GitHub. Click **+** at the top right, then **New repository**.
2. Name it `reckoner`. Choose **Private** or **Public** (see the note below), leave everything else as it is, and click **Create repository**.
3. On the next page, click the link **uploading an existing file**.
4. On your PC, unzip `Reckoner-project.zip` and open the folder. Select everything inside it (Ctrl+A) and drag it all onto the GitHub page.
5. Click **Commit changes**. The repository's file list should now show `ios`, `src` and the rest at the top level, not one folder that contains them all.
6. Add the build instructions by hand, because GitHub's uploader leaves out anything whose name starts with a dot. Click **Add file**, then **Create new file**. Type `.github/workflows/build.yml` as the name, paste in the contents of that file from the zip (open it in Notepad), and click **Commit changes**.
7. Open the **Actions** tab. A run called **Build iPhone app** starts by itself. Click it to watch. It has two jobs: **Build Reckoner.ipa**, which takes about a minute, and **Try it in the iPhone simulator**, which takes a few minutes more and only checks the result. Either can wait in a queue first when GitHub's Macs are busy.
8. When **Build Reckoner.ipa** has its green tick, go back to the repository's front page and click **Releases** on the right. Under **Assets**, download **Reckoner.ipa**. That file is the app.

Private or public: both work. Builds for a public repository are free without limit. A private repository uses GitHub's free monthly allowance, and Mac builds use it up about ten times faster than other kinds; a build takes four or five minutes of Mac time, so the allowance is still enough for a few dozen builds a month.

If the Actions tab stays empty, check step 6: the file must be called exactly `.github/workflows/build.yml`, at the top level of the repository.

### Part 2. Install it with Sideloadly

1. Install **iTunes** and **iCloud** from Apple's website, not from the Microsoft Store. Sideloadly needs these versions, and links to both are on [sideloadly.io](https://sideloadly.io/). If you already have the Microsoft Store versions, uninstall them first.
2. Download and install **Sideloadly** from [sideloadly.io](https://sideloadly.io/).
3. Connect the iPhone with its cable and unlock it. When it asks whether to trust this computer, tap **Trust** and enter your passcode.
4. Open Sideloadly. Your iPhone should appear in its device list.
5. Drag `Reckoner.ipa` onto the Sideloadly window.
6. Type your Apple ID in the box for it and click **Start**. Enter your password when asked, and the six-digit code Apple sends to your devices.
7. Wait until the log at the bottom says **Done**.

About the Apple ID: Sideloadly uses it to ask Apple for a free personal signing certificate, which is what lets the app run on your phone. Sideloadly states that your Apple ID and password are sent only to Apple's servers. If you would rather not type your main Apple ID into another program, create a second free Apple ID and use that one here.

### Part 3. Allow it on the iPhone

1. Open **Settings**, then **General**, then **VPN & Device Management**. Under **Developer App**, tap your Apple ID and then **Trust**.
2. On iOS 16 and newer, open **Settings**, then **Privacy & Security**, then **Developer Mode**. Turn it on, let the phone restart, and tap **Turn On** when it asks again.
3. Open **Reckoner** from the Home Screen.

If you cannot find Developer Mode in step 2, it only appears after an app has been installed this way, so finish Part 2 first.

### Every seven days

Apple lets a free Apple ID sign an app for seven days. After that Reckoner will not open until it is refreshed:

1. Connect the iPhone to the PC.
2. Open Sideloadly, drag in the same `Reckoner.ipa`, use the same Apple ID and click **Start**.

Your sheets stay where they are, because the app is refreshed in place. Do not delete Reckoner from the phone first; deleting an app deletes its data.

Sideloadly can also do this by itself. Its automatic refresh renews the app shortly before it expires, whenever the PC is on and can see the phone, by cable or over Wi-Fi. Sideloadly's website explains how to switch it on.

Other limits of a free Apple ID: three apps installed this way at one time, and ten new app IDs in any seven days. A paid Apple Developer membership (99 US dollars a year) raises the seven days to a year.

For safety, make a backup file now and then: in Reckoner, tap the sliders button at the bottom left of a sheet, then **Settings**, then **Save a backup**, and keep the file in iCloud Drive or email it to yourself.

### If something goes wrong

| What you see | What to do |
|---|---|
| A red cross on **Build Reckoner.ipa** | Click the job, then the step with the red cross, and copy the lines marked `error:`. Those lines say what to fix. |
| A red cross only on **Try it in the iPhone simulator** | The app was still built and can be installed. Open the run's summary to see which check failed; the screenshots are under **simulator-check**. |
| Sideloadly shows no device | Reinstall iTunes and iCloud from Apple's website, restart the PC, tap **Trust** on the phone, and try another cable or USB port. |
| "Untrusted Developer" on the iPhone | Part 3, step 1. |
| "Developer Mode required" | Part 3, step 2. |
| "Your maximum App ID limit has been reached" | Apple's limit of ten in seven days. Wait a few days, or use another Apple ID. |
| The app stopped opening after a week | Refresh it as described under "Every seven days". |

[AltStore](https://altstore.io/) is a similar free tool if you prefer it to Sideloadly. It installs the same `Reckoner.ipa`.

## How Reckoner works

- **Type a calculation and press the yellow key.** `5.73 × 458 ÷ 27` becomes three number rows and a result row. Results are marked with a highlighter.
- **Change a number.** Tap it and type. Every result that depends on it follows as you type.
- **Name a row.** Tap its left side. You can also set a symbol, a unit before or after the number, and how it is rounded.
- **Reuse a row.** Press the chain key and tap a row to put it in the calculation you are typing. It stays linked.
- **Use letters.** Switch to the letter keys and type a formula such as `n × (n + 1) ÷ 2`. Each letter becomes a row waiting for its number.
- **Functions.** The *fx* key has square root, powers, percent, rounding, sums and averages, standard deviation, trigonometry, logarithms, comparisons and `if`. **Total of the rows above** adds a running total that keeps up as you add numbers.
- **Brackets.** Brackets appear by themselves when the kind of operator changes, as on a pocket calculator. To bracket part of a sum afterwards, press `)` and choose where the bracket opens.
- **Edit a formula.** Tap a result twice, or tap it once and choose **Edit formula**.
- **Delete without breaking anything.** Swipe a row left. Formulas that used it keep working, because its number or formula is written into them.
- **Rearrange.** Hold a row to reorder rows or delete several.
- **Share.** A sheet exports as a PDF, a CSV file for a spreadsheet program, plain text, or a sheet file that Reckoner can open again.
- **Organise.** Folders, sixteen ready-made templates, light and dark appearance, and four number formats.

## What is in this project

| Folder | What it holds |
|---|---|
| `src/` | The app itself: the calculation engine, the interface, the PDF writer and the styles. Plain JavaScript and CSS with no libraries. |
| `ios/` | A small Swift program that shows the app full screen on the iPhone and gives it saved files, the share sheet, haptics and room for the keyboard. `ios/project.yml` describes the Xcode project. |
| `tools/build.py` | Packs `src/` into one HTML file, for the iPhone app and for `dist/`. |
| `dist/index.html` | The whole app as one file. It also runs in any browser. |
| `assets/` | The app icon. `tools/make_icon.py` draws it. |
| `tests/` | The checks. |
| `.github/workflows/build.yml` | The instructions GitHub's Mac follows. |

### Changing the app

Edit the files in `src/` and commit. GitHub packs them and builds a new `Reckoner.ipa`, which you install over the old one with Sideloadly. To see a change on your PC first, run `python3 tools/build.py` and open `dist/index.html` in a browser.

To change the name under the icon, edit `CFBundleDisplayName` in `ios/Reckoner/Info.plist`.

### Checks

```
node tests/run-engine.js        the calculation engine
node tests/run-pdf.js           the PDF writer
python3 tests/ui_test.py        the interface at iPhone size, in headless Chromium
python3 tests/run-selftest.py   the self-test the iPhone app can run on itself
python3 tests/monkey.py 1 800   800 random taps, watching for anything that breaks
```

The Python checks need [Playwright](https://playwright.dev/python/) with Chromium.

Every build on GitHub also starts the app in the iPhone simulator, runs the self-test there and attaches screenshots to the run, under **simulator-check**.
