# Per-app language on iOS and Android

What iOS, Android and Expo do with the language a person picks for one app in
the system's settings, as `clients/mobile` relies on it to keep that setting and
the app's own language picker in step. Each fact names its source and how it is
known. Read 2026-11-26.

## Declaring the languages

Source: the Expo SDK 58 `expo-localization` reference,
[Configuration in app config](https://docs.expo.dev/versions/latest/sdk/localization/),
and the plugin's own source,
`clients/mobile/node_modules/expo-localization/plugin/src/withExpoLocalization.ts`
(58.0.5). Documented, and read from source.

- `supportedLocales` is "the locales your app supports, used to enable per-app
  language selection in the system settings", one list for both platforms or an
  `ios` and an `android` list.
- On iOS the plugin writes the list to `CFBundleLocalizations` in Info.plist.
  Apple calls that key "the localizations handled manually by your app"
  ([reference](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundlelocalizations)).
  Settings > KROMA > Language lists exactly these languages: seen on an iPhone
  in November 2026.
- On Android the plugin writes `res/xml/locales_config.xml`, points
  `android:localeConfig` at it on `<application>`, and adds the same languages to
  `resourceConfigurations` in `app/build.gradle` (`zh-Hans` also keeps the
  `zh-rCN` resources libraries ship).
- The plugin's `allowDynamicLocaleChangesAndroid` defaults to true and adds
  `locale|layoutDirection` to the main activity's `android:configChanges`, so a
  language change reaches the running app without recreating the activity.
  Verified with `npx expo config --type introspect` in `clients/mobile`.
- `clients/mobile/app.config.ts` passes `productLocales()` from
  `@kromatv/build-info` as `supportedLocales`, so the list is the one
  `packages/core/src/locales/i18n.json` offers.

## Android 13 and later

Sources: [Per-app language preferences](https://developer.android.com/guide/topics/resources/app-languages)
and the [`LocaleManager` reference](https://developer.android.com/reference/android/app/LocaleManager).
Documented. Not yet seen on a device.

- From Android 13 (API 33) a person picks an app's language under
  Settings > Apps > (app) > Language, or Settings > System > Languages & input >
  App languages. An app without `android:localeConfig` is not listed.
- `LocaleManager.setApplicationLocales(LocaleList)` sets it from the app. The
  guide: these APIs "automatically sync with system settings", so an in-app
  picker that uses them shows in the system setting too. An empty `LocaleList`
  resets the app to the system's language.
- "Changes to app locales will result in a configuration change (and
  potentially an Activity lifecycle event)". "The set locales are persisted;
  they are backed up if the user has enabled Backup & Restore."
- The app reads its locales as before, from its in-process `LocaleList`:
  "a union of any app-specific locales and system locales, with the
  app-specific locales appearing first". `expo-localization`'s `getLocales()`
  reads `LocaleListCompat.getDefault()`, so its first entry is the per-app
  language when one is set.
- For an app that already had its own picker, the guide asks to hand the stored
  choice to `setApplicationLocales` the first time the app runs on Android 13.
- Below API 33 there is no system setting. AndroidX's
  `AppCompatDelegate.setApplicationLocales` can store a choice itself there
  (`autoStoreLocales`); KROMA keeps its own stored choice instead and calls
  nothing.
- `expo-localization`: "On Android, the user can change locale preferences in
  Settings without restarting apps", and `useLocales()` "will rerender with a
  new list of locales" when the OS settings change.

KROMA's native half is `clients/mobile/modules/app-language`, which calls
`setApplicationLocales` on API 33 and later and does nothing below.

## iOS and iPadOS

Sources: WWDC19 session 403,
[Creating Great Localized Experiences with Xcode 11](https://developer.apple.com/videos/play/wwdc2019/403/),
the [`openSettingsURLString` reference](https://developer.apple.com/documentation/uikit/uiapplication/opensettingsurlstring),
and Apple's Developer Forums. Documented, except where marked.

- Since iOS 13, an app's page in Settings has a Language row that "appears for
  multilingual users", where a person picks the app's language apart from the
  system's.
- "When the user does change the language of your app, your app will be
  relaunched in the target language." So the app sees a new language only at
  launch. `expo-localization` agrees: "On iOS, the results will remain the same
  while the app is running."
- Apple gives no API to set it. The session: "do not attempt to set the
  application language manually in code", and "if you do need to add the option
  within your app to switch languages, we recommend you Launch into Settings".
- `UIApplication.openSettingsURLString` opens "your app's custom settings in the
  Settings app". React Native's `Linking.openSettings()` opens it.
- Writing `AppleLanguages` to the app's `UserDefaults` is what libraries such as
  `react-native-localization-settings` do. An Apple DTS engineer
  ([forum thread 771938](https://developer.apple.com/forums/thread/771938)):
  "`AppleLanguages` is a private API", and "apps that change the key will risk
  at getting rejected in the App Review process". KROMA does not write it.
- `Locale.preferredLanguages` is "a list of the user's preferred languages",
  and `Bundle.main.preferredLocalizations` the language the app runs in. With a
  per-app language set, `Locale.preferredLanguages.first` is that language, so
  `expo-localization`'s `getLocales()` leads with it. Observed by a developer
  ([forum thread 769769](https://developer.apple.com/forums/thread/769769)) and
  not documented by Apple.
- The Language row is hidden when the device has a single preferred language
  under General > Language & Region. Reported by developers from 2022 to the
  iOS 18 beta ([forum thread 721302](https://developer.apple.com/forums/thread/721302))
  and not answered by Apple. The `UIPrefersShowingLanguageSettings` Info.plist key
  suggested there has no page in Apple's documentation, and KROMA does not set
  it. Open question.

KROMA's native half on iOS only reports that the app can open the setting and
not change it.

## What KROMA does with this

`clients/mobile/src/lib/language-sync.ts` holds the rule and
`clients/mobile/README.md` describes it: the app follows the system's language
for it when that moved since the app last looked, and otherwise hands the
system its own choice where it may (Android 13+), or names the language still
set there with a way to Settings (iOS).
