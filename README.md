# Reckoner

A pocket spreadsheet for your phone. Type a calculation once, and every number in it becomes a row you can rename and change later, so the same sum is ready the next time you need it. Tips, loan payments, paint for a room, a running total of receipts.

Reckoner is free and has nothing locked: no purchases, no limit on sheets, no ads, no account. Your sheets stay on your device.

## Use it on your phone

Open **https://giftedelephant1.github.io/reckoner/** and add it to your Home Screen. It then opens full screen like any other app, with its own icon, and it works without an internet connection.

**iPhone or iPad.** Open the link in Safari. Tap the Share button (the square with an arrow pointing up), choose **Add to Home Screen**, then tap **Add**.

**Android.** Open the link in Chrome. Tap the menu (three dots), then **Add to Home screen** or **Install app**.

**Computer.** The same link works in any browser.

Your sheets are kept on the device, inside the app's own storage. They are not sent anywhere. If you clear the browser's website data, or delete the app from the Home Screen, they go with it, so save a backup now and then: open **Settings** (the sliders button at the bottom left) and choose **Save a backup**. A backup file opens on any device with **Settings**, then **Open a file**, and it also moves your sheets to a new phone.

## The iPhone app

There is also a native iPhone app, `Reckoner.ipa`, on the [Releases page](../../releases/latest). It has the same features and adds the iOS share sheet and haptics. It is not on the App Store, so installing it takes a computer and a free tool such as [Sideloadly](https://sideloadly.io/):

1. Install Sideloadly on a Mac or Windows PC. On Windows it needs the versions of iTunes and iCloud from Apple's own download links, which are on Sideloadly's page, not the Microsoft Store versions.
2. Connect the iPhone by cable, unlock it and tap **Trust**.
3. Open Sideloadly, drag `Reckoner.ipa` onto it, enter your Apple ID and click **Start**. Your Apple ID and password go only to Apple, which issues the certificate the app is signed with.
4. On the iPhone, open **Settings**, then **General**, then **VPN & Device Management**, and trust the app. On iOS 16 or later, also turn on **Settings**, then **Privacy & Security**, then **Developer Mode**.

With a free Apple ID the app stops opening after seven days unless it is refreshed the same way; Sideloadly can do that by itself when the phone is near the computer. A paid Apple Developer membership extends the seven days to a year. If you only want to use Reckoner, the web version above is the easy route.

## How Reckoner works

- **Type a calculation and press the yellow key.** `5.73 × 458 ÷ 27` becomes three number rows and a result row. Results are marked with a highlighter.
- **Change a number.** Tap it and type. Every result that depends on it follows as you type.
- **Jot down a number.** Type just a number and press the yellow key. It becomes a row of its own, ready for a name.
- **Name a row.** Tap its left side. You can also give it a symbol, a unit before or after the number, and choose how it is rounded.
- **Reuse a row.** While typing, press the chain key and tap a row to put it into the calculation. It stays linked, so when the row changes, so does the result.
- **Use letters.** Switch to the letter keys and type a formula such as `n × (n + 1) ÷ 2`. Each letter becomes a row waiting for its number.
- **Functions.** The *fx* key has square root, powers, percent, rounding, sums and averages, standard deviation, trigonometry, logarithms, comparisons and `if`. **Total of the rows above** adds a running total that keeps up as you add numbers.
- **Brackets.** Brackets appear by themselves when the kind of operator changes, as on a pocket calculator. To bracket part of a sum afterwards, press `)` and choose where the bracket opens; hold `)` to place one by hand.
- **See or edit a formula.** Tap a result once to see how it is worked out, twice to edit the formula.
- **Delete without breaking anything.** Swipe a row left. Formulas that used it keep working, because its number or formula is written into them.
- **Rearrange.** Hold a row, or choose **Edit rows** in the sheet options, to reorder rows or delete several at once.
- **Share.** The sheet options export a PDF, a CSV file for a spreadsheet program, plain text, or a sheet file that another copy of Reckoner can open.
- **Organise.** Folders, sixteen ready-made templates, light and dark appearance, and four number formats, all under Settings and New sheet.

The example sheet that opens the first time is there to play with: tap a number, type a new one, and watch the results follow.

---

The app is one web page, built from the code in `src`; `ios` holds the small iPhone shell around it.
